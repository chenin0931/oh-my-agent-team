ALTER TABLE comment
    ADD COLUMN author_name_snapshot TEXT;

ALTER TABLE activity_log
    ADD COLUMN actor_name_snapshot TEXT;

CREATE OR REPLACE FUNCTION resolve_actor_name_snapshot(
    snapshot_actor_type TEXT,
    snapshot_actor_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    actor_name TEXT;
BEGIN
    IF snapshot_actor_type = 'agent' THEN
        SELECT name INTO actor_name
        FROM agent
        WHERE id = snapshot_actor_id;
    ELSIF snapshot_actor_type = 'member' THEN
        SELECT name INTO actor_name
        FROM "user"
        WHERE id = snapshot_actor_id;
    ELSIF snapshot_actor_type = 'system' THEN
        actor_name := 'System';
    END IF;

    RETURN actor_name;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot_comment_author_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.author_name_snapshot IS NULL THEN
        NEW.author_name_snapshot := resolve_actor_name_snapshot(NEW.author_type, NEW.author_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_comment_author_name
BEFORE INSERT ON comment
FOR EACH ROW
EXECUTE FUNCTION snapshot_comment_author_name();

CREATE OR REPLACE FUNCTION snapshot_activity_actor_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.actor_name_snapshot IS NULL THEN
        NEW.actor_name_snapshot := resolve_actor_name_snapshot(NEW.actor_type, NEW.actor_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_activity_actor_name
BEFORE INSERT ON activity_log
FOR EACH ROW
EXECUTE FUNCTION snapshot_activity_actor_name();

UPDATE comment
SET author_name_snapshot = resolve_actor_name_snapshot(author_type, author_id)
WHERE author_name_snapshot IS NULL;

UPDATE activity_log
SET actor_name_snapshot = resolve_actor_name_snapshot(actor_type, actor_id)
WHERE actor_name_snapshot IS NULL;
