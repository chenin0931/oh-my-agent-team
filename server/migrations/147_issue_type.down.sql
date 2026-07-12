CREATE TEMPORARY TABLE issue_acceptance_criteria_backup AS
SELECT id, acceptance_criteria FROM issue;

ALTER TABLE issue DROP COLUMN acceptance_criteria;
ALTER TABLE issue ADD COLUMN acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE issue i
SET acceptance_criteria = CASE
  WHEN b.acceptance_criteria IS NULL OR btrim(b.acceptance_criteria) = '' THEN '[]'::jsonb
  ELSE jsonb_build_array(b.acceptance_criteria)
END
FROM issue_acceptance_criteria_backup b
WHERE b.id = i.id;

DROP TABLE issue_acceptance_criteria_backup;

DROP INDEX IF EXISTS idx_issue_workspace_epic;
DROP INDEX IF EXISTS idx_issue_workspace_parent_type;
DROP INDEX IF EXISTS idx_issue_workspace_type;

ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_issue_type_check;
ALTER TABLE issue DROP COLUMN IF EXISTS epic_id;
ALTER TABLE issue DROP COLUMN IF EXISTS issue_type;
