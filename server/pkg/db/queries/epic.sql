-- Epic planning containers intentionally share the issue table so existing
-- comments, subscriptions, activities and attachments retain their foreign
-- keys. These queries are the domain boundary: every read is type-scoped.

-- name: GetEpicInWorkspace :one
SELECT *
FROM issue
WHERE id = @id
  AND workspace_id = @workspace_id
  AND issue_type = 'epic';

-- name: ListEpics :many
SELECT i.*,
       COALESCE(stats.total_issues, 0)::bigint AS total_issues,
       COALESCE(stats.done_issues, 0)::bigint AS done_issues,
       COALESCE(stats.blocked_issues, 0)::bigint AS blocked_issues
FROM issue i
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE child.status <> 'cancelled') AS total_issues,
         COUNT(*) FILTER (WHERE child.status = 'done') AS done_issues,
         COUNT(*) FILTER (WHERE child.status = 'blocked') AS blocked_issues
  FROM issue child
  WHERE child.workspace_id = i.workspace_id
    AND child.epic_id = i.id
    AND child.issue_type = 'issue'
) stats ON TRUE
WHERE i.workspace_id = @workspace_id
  AND i.issue_type = 'epic'
  AND (sqlc.narg('project_id')::uuid IS NULL OR i.project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('lifecycle')::text IS NULL OR i.status = sqlc.narg('lifecycle'))
  AND (sqlc.narg('owner_id')::uuid IS NULL OR i.assignee_id = sqlc.narg('owner_id'))
  AND (
    sqlc.narg('search')::text IS NULL
    OR LOWER(i.title) LIKE '%' || LOWER(sqlc.narg('search')) || '%'
    OR LOWER(COALESCE(i.description, '')) LIKE '%' || LOWER(sqlc.narg('search')) || '%'
  )
ORDER BY i.position ASC, i.updated_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountEpics :one
SELECT COUNT(*)
FROM issue i
WHERE i.workspace_id = @workspace_id
  AND i.issue_type = 'epic'
  AND (sqlc.narg('project_id')::uuid IS NULL OR i.project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('lifecycle')::text IS NULL OR i.status = sqlc.narg('lifecycle'))
  AND (sqlc.narg('owner_id')::uuid IS NULL OR i.assignee_id = sqlc.narg('owner_id'))
  AND (
    sqlc.narg('search')::text IS NULL
    OR LOWER(i.title) LIKE '%' || LOWER(sqlc.narg('search')) || '%'
    OR LOWER(COALESCE(i.description, '')) LIKE '%' || LOWER(sqlc.narg('search')) || '%'
  );

-- name: UpdateEpic :one
UPDATE issue
SET title = @title,
    description = sqlc.narg('description'),
    acceptance_criteria = sqlc.narg('success_criteria'),
    status = @lifecycle,
    epic_health = sqlc.narg('health'),
    priority = @priority,
    assignee_type = sqlc.narg('owner_type'),
    assignee_id = sqlc.narg('owner_id'),
    project_id = @project_id,
    start_date = sqlc.narg('start_date'),
    due_date = sqlc.narg('target_date'),
    updated_at = now()
WHERE id = @id
  AND workspace_id = @workspace_id
  AND issue_type = 'epic'
RETURNING *;

-- name: MoveEpicWorkItemsToProject :exec
UPDATE issue
SET project_id = @project_id,
    updated_at = now()
WHERE workspace_id = @workspace_id
  AND epic_id = @epic_id
  AND issue_type IN ('issue', 'subtask');

-- name: DeleteEpic :exec
WITH detached AS (
  UPDATE issue
  SET epic_id = NULL,
      updated_at = now()
  WHERE workspace_id = @workspace_id
    AND epic_id = @epic_id
    AND issue_type IN ('issue', 'subtask')
)
DELETE FROM issue target
WHERE target.id = @epic_id
  AND target.workspace_id = @workspace_id
  AND target.issue_type = 'epic';

-- name: ListEpicWorkItems :many
SELECT i.*
FROM issue i
WHERE i.workspace_id = @workspace_id
  AND i.epic_id = @epic_id
  AND i.issue_type IN ('issue', 'subtask')
ORDER BY CASE i.issue_type WHEN 'issue' THEN 0 ELSE 1 END,
         i.position ASC,
         i.created_at ASC;

-- name: GetEpicStatusDistribution :many
SELECT status, COUNT(*)::bigint AS count
FROM issue
WHERE workspace_id = @workspace_id
  AND epic_id = @epic_id
  AND issue_type = 'issue'
  AND status <> 'cancelled'
GROUP BY status
ORDER BY status;
