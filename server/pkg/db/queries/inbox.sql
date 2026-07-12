-- name: ListInboxItems :many
SELECT i.*,
       iss.status as issue_status
FROM inbox_item i
LEFT JOIN issue iss ON iss.id = i.issue_id
WHERE i.workspace_id = $1 AND i.recipient_type = $2 AND i.recipient_id = $3 AND i.archived = false
ORDER BY i.created_at DESC;

-- name: GetInboxItem :one
SELECT * FROM inbox_item
WHERE id = $1;

-- name: GetInboxItemInWorkspace :one
SELECT * FROM inbox_item
WHERE id = $1 AND workspace_id = $2;

-- name: CreateInboxItem :one
INSERT INTO inbox_item (
    workspace_id, recipient_type, recipient_id,
    type, severity, issue_id, target_type, target_id, title, body,
    actor_type, actor_id, details
) VALUES (
    $1, $2, $3, $4, $5, $6,
    COALESCE(sqlc.narg('target_type')::text, CASE WHEN $6::uuid IS NOT NULL THEN 'issue' END),
    COALESCE(sqlc.narg('target_id')::uuid, $6::uuid),
    $7, $8, $9, $10, $11
)
RETURNING *;

-- name: MarkInboxRead :one
UPDATE inbox_item SET read = true
WHERE id = $1
RETURNING *;

-- name: ArchiveInboxItem :one
UPDATE inbox_item SET archived = true
WHERE id = $1
RETURNING *;

-- name: ArchiveInboxByIssue :execrows
UPDATE inbox_item SET archived = true
WHERE workspace_id = $1 AND recipient_type = $2 AND recipient_id = $3 AND issue_id = $4 AND archived = false;

-- name: ArchiveInboxByIssueAndType :many
UPDATE inbox_item SET archived = true
WHERE workspace_id = $1 AND issue_id = $2 AND type = $3 AND archived = false
RETURNING recipient_type, recipient_id;

-- name: CountUnreadInbox :one
SELECT count(*) FROM inbox_item
WHERE workspace_id = $1 AND recipient_type = $2 AND recipient_id = $3 AND read = false AND archived = false;

-- name: CountUnreadInboxByWorkspace :many
-- Per-workspace unread inbox counts for a recipient member, matching the
-- inbox UI's deduplicated view. An unread action-required item wins over a
-- newer informational update for the same issue until the user opens it;
-- otherwise the newest item wins. Items without an issue group on their id.
SELECT newest.workspace_id, count(*) AS count
FROM (
    SELECT DISTINCT ON (i.workspace_id, COALESCE(i.target_id, i.issue_id, i.id))
        i.workspace_id, i.read
    FROM inbox_item i
    JOIN member m ON m.workspace_id = i.workspace_id AND m.user_id = i.recipient_id
    WHERE i.recipient_type = 'member'
      AND i.recipient_id = $1
      AND i.archived = false
    ORDER BY i.workspace_id, COALESCE(i.target_id, i.issue_id, i.id),
             CASE WHEN i.read = false AND i.severity = 'action_required' THEN 0 ELSE 1 END,
             i.created_at DESC
) newest
WHERE newest.read = false
GROUP BY newest.workspace_id;

-- name: MarkAllInboxRead :execrows
UPDATE inbox_item SET read = true
WHERE workspace_id = $1 AND recipient_type = 'member' AND recipient_id = $2 AND archived = false AND read = false;

-- name: ArchiveAllInbox :execrows
UPDATE inbox_item SET archived = true
WHERE workspace_id = $1 AND recipient_type = 'member' AND recipient_id = $2 AND archived = false;

-- name: ArchiveAllReadInbox :execrows
UPDATE inbox_item SET archived = true
WHERE workspace_id = $1 AND recipient_type = 'member' AND recipient_id = $2 AND read = true AND archived = false;

-- name: ArchiveCompletedInbox :execrows
UPDATE inbox_item i SET archived = true
WHERE i.workspace_id = $1 AND i.recipient_type = 'member' AND i.recipient_id = $2 AND i.archived = false
  AND i.issue_id IN (SELECT id FROM issue WHERE status IN ('done', 'cancelled'));

-- name: ArchiveInboxByTarget :execrows
UPDATE inbox_item SET archived = true
WHERE workspace_id = @workspace_id
  AND recipient_type = @recipient_type
  AND recipient_id = @recipient_id
  AND target_type = @target_type
  AND target_id = @target_id
  AND archived = false;
