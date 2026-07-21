-- name: CreateAgentVersion :one
INSERT INTO agent_version (
    agent_id, workspace_id, version_number, name, description, instructions,
    model, thinking_level, skill_ids, tool_config, runtime_config, config_hash
)
VALUES (
    @agent_id,
    @workspace_id,
    COALESCE((SELECT max(version_number) + 1 FROM agent_version WHERE agent_id = @agent_id), 1),
    @agent_name,
    @description,
    @instructions,
    sqlc.narg(model),
    sqlc.narg(thinking_level),
    @skill_ids,
    @tool_config,
    @runtime_config,
    @config_hash
)
ON CONFLICT (agent_id, config_hash) DO UPDATE
SET config_hash = EXCLUDED.config_hash
RETURNING *;

-- name: GetLatestAgentVersion :one
SELECT * FROM agent_version
WHERE agent_id = $1
ORDER BY version_number DESC
LIMIT 1;

-- name: GetAgentVersion :one
SELECT * FROM agent_version
WHERE id = $1;

-- name: GetAgentVersionByHash :one
SELECT * FROM agent_version
WHERE agent_id = @agent_id AND config_hash = @config_hash
LIMIT 1;

-- name: ListAgentVersions :many
SELECT * FROM agent_version
WHERE agent_id = $1
ORDER BY version_number DESC;

-- name: ListAgentRuntimeBindings :many
SELECT
    b.id,
    b.agent_id,
    b.runtime_id,
    b.priority,
    b.enabled,
    b.created_by,
    b.created_at,
    b.updated_at,
    r.name AS runtime_name,
    r.custom_name AS runtime_custom_name,
    r.provider,
    r.profile_id,
    r.daemon_id,
    r.runtime_mode,
    r.status AS runtime_status,
    r.owner_id AS runtime_owner_id,
    COALESCE(active.active_count, 0)::integer AS active_task_count
FROM agent_runtime_binding b
JOIN agent_runtime r ON r.id = b.runtime_id
LEFT JOIN LATERAL (
    SELECT count(*) AS active_count
    FROM agent_task_queue t
    WHERE t.runtime_id = r.id
      AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory')
) active ON TRUE
WHERE b.agent_id = $1
ORDER BY b.priority ASC, b.runtime_id ASC;

-- name: UpsertAgentRuntimeBinding :one
INSERT INTO agent_runtime_binding (
    agent_id, runtime_id, priority, enabled, created_by
)
VALUES (@agent_id, @runtime_id, @priority, @enabled, sqlc.narg(created_by))
ON CONFLICT (agent_id, runtime_id) DO UPDATE SET
    priority = EXCLUDED.priority,
    enabled = EXCLUDED.enabled,
    updated_at = now()
RETURNING *;

-- name: DeleteAgentRuntimeBinding :execrows
DELETE FROM agent_runtime_binding
WHERE agent_id = @agent_id AND runtime_id = @runtime_id;

-- name: SelectManagedRuntimeForAgent :one
SELECT r.*
FROM agent_runtime_binding b
JOIN agent_runtime r ON r.id = b.runtime_id
JOIN agent a ON a.id = b.agent_id
LEFT JOIN LATERAL (
    SELECT count(*) AS active_count
    FROM agent_task_queue t
    WHERE t.runtime_id = r.id
      AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory')
) active ON TRUE
WHERE b.agent_id = $1
  AND b.enabled = TRUE
  AND r.status = 'online'
ORDER BY
    CASE WHEN r.id = a.runtime_id THEN 0 ELSE 1 END,
    b.priority ASC,
    COALESCE(active.active_count, 0) ASC,
    r.id ASC
LIMIT 1;

-- name: SelectManagedRuntimeForAgentExcluding :one
SELECT r.*
FROM agent_runtime_binding b
JOIN agent_runtime r ON r.id = b.runtime_id
JOIN agent a ON a.id = b.agent_id
LEFT JOIN LATERAL (
    SELECT count(*) AS active_count
    FROM agent_task_queue t
    WHERE t.runtime_id = r.id
      AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory')
) active ON TRUE
WHERE b.agent_id = @agent_id
  AND b.enabled = TRUE
  AND r.status = 'online'
  AND r.id <> @excluded_runtime_id
ORDER BY
    CASE WHEN r.id = a.runtime_id THEN 0 ELSE 1 END,
    b.priority ASC,
    COALESCE(active.active_count, 0) ASC,
    r.id ASC
LIMIT 1;

-- name: CreateAgentSession :one
INSERT INTO agent_session (
    workspace_id, issue_id, goal, mode, status, entry_agent_id, entry_squad_id,
    created_by, max_iterations, metadata, started_at
)
VALUES (
    @workspace_id,
    sqlc.narg(issue_id),
    @goal,
    @mode,
    @status,
    sqlc.narg(entry_agent_id),
    sqlc.narg(entry_squad_id),
    sqlc.narg(created_by),
    @max_iterations,
    @metadata,
    CASE WHEN @status = 'running' THEN now() ELSE NULL END
)
RETURNING *;

-- name: GetAgentSession :one
SELECT * FROM agent_session
WHERE id = $1;

-- name: GetAgentSessionInWorkspace :one
SELECT * FROM agent_session
WHERE id = @id AND workspace_id = @workspace_id;

-- name: GetOpenExecutorSessionForAgent :one
SELECT * FROM agent_session
WHERE issue_id = @issue_id
  AND entry_agent_id = @agent_id
  AND mode = 'executor'
  AND status NOT IN ('completed', 'failed', 'cancelled')
ORDER BY created_at DESC
LIMIT 1;

-- name: GetOpenCoordinatorSessionForSquad :one
SELECT * FROM agent_session
WHERE issue_id = @issue_id
  AND entry_squad_id = @squad_id
  AND mode IN ('executor', 'coordinator')
  AND status NOT IN ('completed', 'failed', 'cancelled')
ORDER BY created_at DESC
LIMIT 1;

-- name: GetOpenAdvisorSessionForAgent :one
SELECT * FROM agent_session
WHERE issue_id = @issue_id
  AND entry_agent_id = @agent_id
  AND mode = 'advisor'
  AND status NOT IN ('completed', 'failed', 'cancelled')
ORDER BY created_at DESC
LIMIT 1;

-- name: ListAgentSessionsByIssue :many
SELECT * FROM agent_session
WHERE issue_id = $1
ORDER BY created_at DESC;

-- name: ListAgentSessionsBySquad :many
SELECT * FROM agent_session
WHERE entry_squad_id = @squad_id
ORDER BY created_at DESC
LIMIT @result_limit;

-- name: ListOpenAgentSessionsByIssue :many
SELECT * FROM agent_session
WHERE issue_id = $1
  AND status NOT IN ('completed', 'failed', 'cancelled')
ORDER BY created_at ASC;

-- name: ListAgentSessionsByAgent :many
SELECT s.*
FROM agent_session s
WHERE EXISTS (
    SELECT 1
    FROM agent_session_thread t
    WHERE t.agent_session_id = s.id
      AND t.agent_id = @agent_id
)
ORDER BY created_at DESC
LIMIT @result_limit OFFSET @result_offset;

-- name: ListWaitingAgentSessionsForRuntime :many
SELECT s.id
FROM agent_session s
JOIN agent_session_thread t
  ON t.agent_session_id = s.id
 AND t.parent_thread_id IS NULL
JOIN agent_runtime_binding b
  ON b.agent_id = t.agent_id
 AND b.runtime_id = @runtime_id
 AND b.enabled = TRUE
WHERE s.status = 'waiting_environment'
  AND NOT EXISTS (
    SELECT 1
    FROM agent_task_queue task
    WHERE task.agent_session_id = s.id
      AND task.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory')
  )
ORDER BY s.created_at ASC
LIMIT @result_limit;

-- name: ClaimWaitingAgentSession :one
UPDATE agent_session
SET status = 'queued', stop_reason = NULL, updated_at = now()
WHERE id = $1 AND status = 'waiting_environment'
RETURNING *;

-- name: UpdateAgentSessionStatus :one
UPDATE agent_session SET
    status = @status,
    stop_reason = sqlc.narg(stop_reason),
    started_at = CASE
        WHEN @status = 'running' THEN COALESCE(started_at, now())
        ELSE started_at
    END,
    completed_at = CASE
        WHEN @status IN ('completed', 'failed', 'cancelled') THEN COALESCE(completed_at, now())
        ELSE NULL
    END,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: IncrementAgentSessionIteration :one
UPDATE agent_session SET
    iteration_count = iteration_count + 1,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateAgentSessionThread :one
INSERT INTO agent_session_thread (
    agent_session_id, agent_id, agent_version_id, runtime_id, parent_thread_id,
    role, status, permission_policy
)
VALUES (
    @agent_session_id,
    @agent_id,
    @agent_version_id,
    sqlc.narg(runtime_id),
    sqlc.narg(parent_thread_id),
    @role,
    @status,
    @permission_policy
)
RETURNING *;

-- name: GetAgentSessionThread :one
SELECT * FROM agent_session_thread
WHERE id = $1;

-- name: GetPrimaryAgentSessionThread :one
SELECT * FROM agent_session_thread
WHERE agent_session_id = $1 AND parent_thread_id IS NULL
ORDER BY created_at ASC
LIMIT 1;

-- name: GetAgentSessionThreadForAgent :one
SELECT * FROM agent_session_thread
WHERE agent_session_id = @agent_session_id
  AND agent_id = @agent_id
  AND role = @role
ORDER BY created_at DESC
LIMIT 1;

-- name: ListAgentSessionThreads :many
SELECT * FROM agent_session_thread
WHERE agent_session_id = $1
ORDER BY created_at ASC;

-- name: UpdateAgentSessionThreadStatus :one
UPDATE agent_session_thread SET
    status = @status,
    stop_reason = sqlc.narg(stop_reason),
    started_at = CASE
        WHEN @status = 'running' THEN COALESCE(started_at, now())
        ELSE started_at
    END,
    completed_at = CASE
        WHEN @status IN ('completed', 'failed', 'cancelled') THEN COALESCE(completed_at, now())
        ELSE NULL
    END,
    last_turn_at = CASE
        WHEN @status IN ('running', 'idle', 'completed', 'failed') THEN now()
        ELSE last_turn_at
    END,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: CancelOpenAgentSessionThreads :many
UPDATE agent_session_thread SET
    status = 'cancelled',
    stop_reason = @stop_reason,
    completed_at = COALESCE(completed_at, now()),
    updated_at = now()
WHERE agent_session_id = @agent_session_id
  AND status NOT IN ('completed', 'failed', 'cancelled')
RETURNING *;

-- name: UpdateAgentSessionThreadRuntime :one
UPDATE agent_session_thread SET
    runtime_id = sqlc.narg(runtime_id),
    status = @status,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: ResetAgentSessionThreadForRuntimeFailover :one
UPDATE agent_session_thread SET
    runtime_id = @runtime_id,
    provider_session_id = NULL,
    work_dir = NULL,
    status = 'queued',
    stop_reason = NULL,
    completed_at = NULL,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: PinAgentSessionThreadProviderContext :one
UPDATE agent_session_thread SET
    provider_session_id = COALESCE(sqlc.narg(provider_session_id), provider_session_id),
    work_dir = COALESCE(sqlc.narg(work_dir), work_dir),
    last_turn_at = now(),
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: AppendAgentSessionEvent :one
INSERT INTO agent_session_event (
    agent_session_id, thread_id, actor_type, actor_id, event_type, payload,
    visibility, source_task_id, idempotency_key
)
VALUES (
    @agent_session_id,
    sqlc.narg(thread_id),
    @actor_type,
    sqlc.narg(actor_id),
    @event_type,
    @payload,
    @visibility,
    sqlc.narg(source_task_id),
    sqlc.narg(idempotency_key)
)
ON CONFLICT (agent_session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
RETURNING *;

-- name: ListAgentSessionEventsAfter :many
SELECT * FROM agent_session_event
WHERE agent_session_id = @agent_session_id
  AND seq > @after_seq
  AND visibility <> 'system'
ORDER BY seq ASC
LIMIT @result_limit;

-- name: LinkTaskToManagedSession :one
UPDATE agent_task_queue SET
    agent_session_id = @agent_session_id,
    session_thread_id = @session_thread_id
WHERE id = @task_id
RETURNING *;

-- name: MoveQueuedManagedTaskToRuntime :one
UPDATE agent_task_queue SET
    runtime_id = @runtime_id,
    session_id = NULL,
    work_dir = NULL,
    force_fresh_session = TRUE
WHERE id = @id
  AND status = 'queued'
  AND agent_session_id IS NOT NULL
RETURNING *;

-- name: ListTasksByAgentSession :many
SELECT * FROM agent_task_queue
WHERE agent_session_id = $1
ORDER BY created_at ASC;

-- name: CancelActiveTasksByAgentSession :many
UPDATE agent_task_queue SET
    status = 'cancelled',
    completed_at = now(),
    error = COALESCE(sqlc.narg(cancel_reason), 'session cancelled')
WHERE agent_session_id = @agent_session_id
  AND status IN ('queued', 'dispatched', 'running', 'waiting_local_directory', 'deferred')
RETURNING *;

-- name: CreateSessionApproval :one
INSERT INTO session_approval (
    agent_session_id, thread_id, action_namespace, operation_fingerprint,
    title, details, risk_level, requested_by_agent_id, expires_at
)
VALUES (
    @agent_session_id,
    sqlc.narg(thread_id),
    @action_namespace,
    @operation_fingerprint,
    @title,
    @details,
    @risk_level,
    sqlc.narg(requested_by_agent_id),
    @expires_at
)
ON CONFLICT (agent_session_id, operation_fingerprint) DO UPDATE SET
    updated_at = session_approval.updated_at
RETURNING *;

-- name: GetSessionApproval :one
SELECT * FROM session_approval
WHERE id = $1;

-- name: GetSessionApprovalInSession :one
SELECT * FROM session_approval
WHERE id = @id AND agent_session_id = @agent_session_id;

-- name: ListSessionApprovals :many
SELECT * FROM session_approval
WHERE agent_session_id = $1
ORDER BY created_at DESC;

-- name: DecideSessionApproval :one
UPDATE session_approval SET
    status = @status,
    resolved_by_user_id = @resolved_by_user_id,
    decision_reason = sqlc.narg(decision_reason),
    resolved_at = now(),
    updated_at = now()
WHERE id = @id
  AND status = 'pending'
  AND expires_at > now()
RETURNING *;

-- name: ConsumeSessionApproval :one
UPDATE session_approval SET
    status = 'consumed',
    consumed_at = now(),
    updated_at = now()
WHERE id = @id
  AND agent_session_id = @agent_session_id
  AND operation_fingerprint = @operation_fingerprint
  AND status = 'approved'
  AND expires_at > now()
  AND consumed_at IS NULL
RETURNING *;

-- name: CancelPendingSessionApprovals :many
UPDATE session_approval SET
    status = 'cancelled',
    resolved_at = now(),
    updated_at = now()
WHERE agent_session_id = $1 AND status = 'pending'
RETURNING *;

-- name: UpsertSessionOutcome :one
INSERT INTO session_outcome (
    agent_session_id, rubric_markdown, status, max_iterations, created_by
)
VALUES (
    @agent_session_id,
    @rubric_markdown,
    'pending',
    @max_iterations,
    sqlc.narg(created_by)
)
ON CONFLICT (agent_session_id) DO UPDATE SET
    rubric_markdown = EXCLUDED.rubric_markdown,
    status = 'pending',
    current_iteration = 0,
    max_iterations = EXCLUDED.max_iterations,
    completed_at = NULL,
    updated_at = now()
RETURNING *;

-- name: GetSessionOutcome :one
SELECT * FROM session_outcome
WHERE agent_session_id = $1;

-- name: UpdateSessionOutcomeStatus :one
UPDATE session_outcome SET
    status = @status,
    current_iteration = CASE
        WHEN @increment_iteration::boolean THEN current_iteration + 1
        ELSE current_iteration
    END,
    completed_at = CASE WHEN @status = 'passed' THEN now() ELSE NULL END,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: CreateOutcomeEvaluation :one
INSERT INTO outcome_evaluation (
    outcome_id, reviewer_thread_id, attempt, verdict, summary, evidence
)
VALUES (
    @outcome_id,
    sqlc.narg(reviewer_thread_id),
    @attempt,
    @verdict,
    @summary,
    @evidence
)
ON CONFLICT (outcome_id, attempt) DO UPDATE SET
    verdict = EXCLUDED.verdict,
    summary = EXCLUDED.summary,
    evidence = EXCLUDED.evidence
RETURNING *;

-- name: ListOutcomeEvaluations :many
SELECT * FROM outcome_evaluation
WHERE outcome_id = $1
ORDER BY attempt ASC;
