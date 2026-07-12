ALTER TABLE inbox_item
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID;

UPDATE inbox_item
SET target_type = 'issue',
    target_id = issue_id
WHERE issue_id IS NOT NULL
  AND target_id IS NULL;

ALTER TABLE inbox_item DROP CONSTRAINT IF EXISTS inbox_item_target_type_check;
ALTER TABLE inbox_item ADD CONSTRAINT inbox_item_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('issue', 'epic'));

ALTER TABLE inbox_item DROP CONSTRAINT IF EXISTS inbox_item_target_pair_check;
ALTER TABLE inbox_item ADD CONSTRAINT inbox_item_target_pair_check
  CHECK ((target_type IS NULL) = (target_id IS NULL));

CREATE INDEX IF NOT EXISTS idx_inbox_recipient_target
  ON inbox_item(workspace_id, recipient_type, recipient_id, target_type, target_id, created_at DESC);
