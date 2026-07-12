-- Epics share the issue table for history and collaboration data, but use a
-- planning-only lifecycle and never participate in the executable workflow.

ALTER TABLE issue
  ADD COLUMN IF NOT EXISTS epic_health TEXT;

-- Drop the executable-only check before translating existing Epic rows to
-- their planning lifecycle. The replacement conditional check is installed
-- immediately after the data rewrite in the same migration transaction.
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_status_check;
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_epic_status_check;

UPDATE issue
SET status = CASE status
  WHEN 'backlog' THEN 'planned'
  WHEN 'todo' THEN 'in_progress'
  WHEN 'in_progress' THEN 'in_progress'
  WHEN 'in_review' THEN 'in_progress'
  WHEN 'done' THEN 'completed'
  WHEN 'blocked' THEN 'paused'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE 'planned'
END
WHERE issue_type = 'epic';

ALTER TABLE issue ADD CONSTRAINT issue_status_check CHECK (
  (issue_type = 'epic' AND status IN ('planned', 'in_progress', 'paused', 'completed', 'cancelled'))
  OR
  (issue_type <> 'epic' AND status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'))
);

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_epic_health_check;
ALTER TABLE issue ADD CONSTRAINT issue_epic_health_check CHECK (
  (issue_type = 'epic' AND (epic_health IS NULL OR epic_health IN ('on_track', 'at_risk', 'off_track')))
  OR
  (issue_type <> 'epic' AND epic_health IS NULL)
);

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_epic_shape_check;
ALTER TABLE issue ADD CONSTRAINT issue_epic_shape_check CHECK (
  issue_type <> 'epic'
  OR (
    project_id IS NOT NULL
    AND epic_id IS NULL
    AND parent_issue_id IS NULL
    AND (assignee_type IS NULL OR assignee_type IN ('member', 'agent'))
  )
);

CREATE INDEX IF NOT EXISTS idx_issue_epic_project_lifecycle
  ON issue(workspace_id, project_id, status, position)
  WHERE issue_type = 'epic';

CREATE INDEX IF NOT EXISTS idx_issue_executable_workspace_status
  ON issue(workspace_id, status, position)
  WHERE issue_type IN ('issue', 'subtask');

CREATE INDEX IF NOT EXISTS idx_issue_direct_epic_work
  ON issue(workspace_id, epic_id, status)
  WHERE issue_type = 'issue';
