ALTER TABLE issue ADD COLUMN IF NOT EXISTS issue_type TEXT NOT NULL DEFAULT 'issue';
ALTER TABLE issue ADD COLUMN IF NOT EXISTS epic_id UUID REFERENCES issue(id) ON DELETE SET NULL;

UPDATE issue
SET issue_type = 'subtask'
WHERE parent_issue_id IS NOT NULL;

UPDATE issue
SET issue_type = 'issue'
WHERE issue_type IS NULL OR issue_type = '';

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_issue_type_check;
ALTER TABLE issue ADD CONSTRAINT issue_issue_type_check
  CHECK (issue_type IN ('epic', 'issue', 'subtask'));

-- acceptance_criteria shipped in the original schema as a JSON array, but the
-- product now edits it as one Markdown document. Preserve existing array
-- entries as bullet points while moving to a nullable text column.
ALTER TABLE issue ADD COLUMN IF NOT EXISTS acceptance_criteria_markdown TEXT;

UPDATE issue
SET acceptance_criteria_markdown = CASE
  WHEN acceptance_criteria IS NULL OR acceptance_criteria = '[]'::jsonb THEN NULL
  WHEN jsonb_typeof(acceptance_criteria) = 'array' THEN (
    SELECT string_agg('- ' || value, E'\n')
    FROM jsonb_array_elements_text(acceptance_criteria) AS item(value)
  )
  WHEN jsonb_typeof(acceptance_criteria) = 'string' THEN acceptance_criteria #>> '{}'
  ELSE acceptance_criteria::text
END;

ALTER TABLE issue DROP COLUMN acceptance_criteria;
ALTER TABLE issue RENAME COLUMN acceptance_criteria_markdown TO acceptance_criteria;

CREATE INDEX IF NOT EXISTS idx_issue_workspace_type
  ON issue(workspace_id, issue_type);

CREATE INDEX IF NOT EXISTS idx_issue_workspace_parent_type
  ON issue(workspace_id, parent_issue_id, issue_type);

CREATE INDEX IF NOT EXISTS idx_issue_workspace_epic
  ON issue(workspace_id, epic_id);
