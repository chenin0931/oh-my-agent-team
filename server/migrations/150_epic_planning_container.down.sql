DROP INDEX IF EXISTS idx_issue_direct_epic_work;
DROP INDEX IF EXISTS idx_issue_executable_workspace_status;
DROP INDEX IF EXISTS idx_issue_epic_project_lifecycle;

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_epic_shape_check;
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_epic_health_check;
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_status_check;

UPDATE issue
SET status = CASE status
  WHEN 'planned' THEN 'backlog'
  WHEN 'paused' THEN 'blocked'
  WHEN 'completed' THEN 'done'
  ELSE status
END
WHERE issue_type = 'epic';

ALTER TABLE issue ADD CONSTRAINT issue_status_check
  CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'));

ALTER TABLE issue DROP COLUMN IF EXISTS epic_health;
