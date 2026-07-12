DROP INDEX IF EXISTS idx_inbox_recipient_target;
ALTER TABLE inbox_item DROP CONSTRAINT IF EXISTS inbox_item_target_pair_check;
ALTER TABLE inbox_item DROP CONSTRAINT IF EXISTS inbox_item_target_type_check;
ALTER TABLE inbox_item DROP COLUMN IF EXISTS target_id;
ALTER TABLE inbox_item DROP COLUMN IF EXISTS target_type;
