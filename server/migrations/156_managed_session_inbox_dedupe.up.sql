CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_managed_session_key
ON inbox_item (workspace_id, recipient_type, recipient_id, (details->>'managed_key'))
WHERE details ? 'managed_key';
