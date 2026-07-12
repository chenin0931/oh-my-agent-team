-- Separate immutable creation audit from current, transferable ownership.
ALTER TABLE squad ADD COLUMN owner_id UUID;

UPDATE squad SET owner_id = creator_id WHERE owner_id IS NULL;

ALTER TABLE squad ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX idx_squad_workspace_owner
    ON squad(workspace_id, owner_id);

-- Preserve compatibility with older internal writers that only provide the
-- immutable creator_id. Public APIs write owner_id explicitly, while the
-- trigger keeps fixtures, imports and rolling deploys from creating orphans.
CREATE OR REPLACE FUNCTION squad_default_owner_from_creator()
RETURNS trigger AS $$
BEGIN
    IF NEW.owner_id IS NULL THEN
        NEW.owner_id := NEW.creator_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER squad_default_owner_before_insert
BEFORE INSERT ON squad
FOR EACH ROW EXECUTE FUNCTION squad_default_owner_from_creator();
