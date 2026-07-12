DROP TRIGGER IF EXISTS squad_default_owner_before_insert ON squad;
DROP FUNCTION IF EXISTS squad_default_owner_from_creator();
DROP INDEX IF EXISTS idx_squad_workspace_owner;
ALTER TABLE squad DROP COLUMN IF EXISTS owner_id;
