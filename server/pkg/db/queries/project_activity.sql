-- name: ListProjectActivity :many
SELECT event_id, target_type, issue_id, issue_number, issue_title, actor_type, actor_id,
       kind, action, body, details, created_at
FROM (
  SELECT a.id AS event_id, CASE WHEN i.issue_type = 'epic' THEN 'epic'::text ELSE 'issue'::text END AS target_type,
         i.id AS issue_id, i.number AS issue_number,
         i.title AS issue_title, a.actor_type, a.actor_id,
         'system'::text AS kind, a.action, NULL::text AS body,
         a.details, a.created_at
  FROM activity_log a
  JOIN issue i ON i.id = a.issue_id
  WHERE i.workspace_id = sqlc.arg('workspace_id')
    AND i.project_id = sqlc.arg('project_id')

  UNION ALL

  SELECT c.id, CASE WHEN i.issue_type = 'epic' THEN 'epic'::text ELSE 'issue'::text END,
         i.id, i.number, i.title, c.author_type, c.author_id,
         CASE WHEN c.author_type = 'agent' THEN 'agent'::text ELSE 'comment'::text END,
         'comment_created'::text, c.content, '{}'::jsonb, c.created_at
  FROM comment c
  JOIN issue i ON i.id = c.issue_id
  WHERE i.workspace_id = sqlc.arg('workspace_id')
    AND i.project_id = sqlc.arg('project_id')

  UNION ALL

  SELECT t.id, 'issue'::text, i.id, i.number, i.title, 'agent'::text, t.agent_id,
         'run'::text, ('task_' || t.status)::text,
         NULLIF(t.error, ''),
         jsonb_build_object('task_id', t.id, 'status', t.status),
         COALESCE(t.completed_at, t.started_at, t.dispatched_at, t.created_at)
  FROM agent_task_queue t
  JOIN issue i ON i.id = t.issue_id
  WHERE i.workspace_id = sqlc.arg('workspace_id')
    AND i.project_id = sqlc.arg('project_id')
    AND i.issue_type IN ('issue', 'subtask')
) events
ORDER BY created_at DESC, event_id DESC
LIMIT sqlc.arg('row_limit') OFFSET sqlc.arg('row_offset');

-- name: CountProjectActivity :one
SELECT (
  (SELECT count(*) FROM activity_log a JOIN issue i ON i.id = a.issue_id
    WHERE i.workspace_id = $1 AND i.project_id = $2) +
  (SELECT count(*) FROM comment c JOIN issue i ON i.id = c.issue_id
    WHERE i.workspace_id = $1 AND i.project_id = $2) +
  (SELECT count(*) FROM agent_task_queue t JOIN issue i ON i.id = t.issue_id
    WHERE i.workspace_id = $1 AND i.project_id = $2 AND i.issue_type IN ('issue', 'subtask'))
)::bigint;
