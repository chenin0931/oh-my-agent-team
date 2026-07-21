DROP TRIGGER IF EXISTS trg_snapshot_activity_actor_name ON activity_log;
DROP FUNCTION IF EXISTS snapshot_activity_actor_name();

DROP TRIGGER IF EXISTS trg_snapshot_comment_author_name ON comment;
DROP FUNCTION IF EXISTS snapshot_comment_author_name();

DROP FUNCTION IF EXISTS resolve_actor_name_snapshot(TEXT, UUID);

ALTER TABLE activity_log
    DROP COLUMN IF EXISTS actor_name_snapshot;

ALTER TABLE comment
    DROP COLUMN IF EXISTS author_name_snapshot;
