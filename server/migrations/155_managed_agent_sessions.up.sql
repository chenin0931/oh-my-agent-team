-- Managed Execution V2 adds a durable execution layer above the existing
-- agent_task_queue. agent_task_queue remains the source of truth for one CLI
-- turn; agent_session groups turns and agent_session_event exposes a redacted,
-- append-only collaboration timeline.

CREATE TABLE agent_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    model TEXT,
    thinking_level TEXT,
    skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    tool_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    config_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_id, version_number),
    UNIQUE(agent_id, config_hash)
);

COMMENT ON TABLE agent_version IS
    'Immutable, secret-free agent configuration snapshots used by managed sessions.';

CREATE TABLE agent_runtime_binding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL REFERENCES agent_runtime(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_id, runtime_id)
);

COMMENT ON TABLE agent_runtime_binding IS
    'Explicit compatible runtime pool for an agent. agent.runtime_id remains the preferred legacy binding.';

CREATE TABLE agent_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issue(id) ON DELETE CASCADE,
    goal TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL CHECK (mode IN ('executor', 'advisor', 'coordinator', 'reviewer', 'planning')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN (
            'queued', 'running', 'waiting_approval', 'waiting_input',
            'waiting_environment', 'idle', 'completed', 'failed', 'cancelled'
        )
    ),
    entry_agent_id UUID REFERENCES agent(id) ON DELETE SET NULL,
    entry_squad_id UUID REFERENCES squad(id) ON DELETE SET NULL,
    created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
    stop_reason TEXT,
    iteration_count INTEGER NOT NULL DEFAULT 0,
    max_iterations INTEGER NOT NULL DEFAULT 3 CHECK (max_iterations BETWEEN 1 AND 20),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (entry_agent_id IS NOT NULL OR entry_squad_id IS NOT NULL),
    CHECK (NOT (entry_agent_id IS NOT NULL AND entry_squad_id IS NOT NULL))
);

CREATE TABLE agent_session_thread (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_session_id UUID NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE RESTRICT,
    agent_version_id UUID NOT NULL REFERENCES agent_version(id) ON DELETE RESTRICT,
    runtime_id UUID REFERENCES agent_runtime(id) ON DELETE SET NULL,
    parent_thread_id UUID REFERENCES agent_session_thread(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('executor', 'advisor', 'coordinator', 'reviewer', 'planner')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN (
            'queued', 'running', 'waiting_approval', 'waiting_input',
            'waiting_environment', 'idle', 'completed', 'failed', 'cancelled'
        )
    ),
    provider_session_id TEXT,
    work_dir TEXT,
    permission_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    stop_reason TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_turn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_session_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGSERIAL NOT NULL UNIQUE,
    agent_session_id UUID NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES agent_session_thread(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'runtime', 'system')),
    actor_id UUID,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace', 'participants', 'owner', 'system')),
    source_task_id UUID REFERENCES agent_task_queue(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_session_event_idempotency
    ON agent_session_event(agent_session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE session_approval (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_session_id UUID NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES agent_session_thread(id) ON DELETE SET NULL,
    action_namespace TEXT NOT NULL,
    operation_fingerprint TEXT NOT NULL,
    title TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_level TEXT NOT NULL DEFAULT 'high' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'consumed')),
    requested_by_agent_id UUID REFERENCES agent(id) ON DELETE SET NULL,
    resolved_by_user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    decision_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    resolved_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_session_id, operation_fingerprint)
);

CREATE TABLE session_outcome (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_session_id UUID NOT NULL UNIQUE REFERENCES agent_session(id) ON DELETE CASCADE,
    rubric_markdown TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluating', 'passed', 'revision_requested', 'waiting_input', 'cancelled')),
    max_iterations INTEGER NOT NULL DEFAULT 3 CHECK (max_iterations BETWEEN 1 AND 10),
    current_iteration INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE outcome_evaluation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id UUID NOT NULL REFERENCES session_outcome(id) ON DELETE CASCADE,
    reviewer_thread_id UUID REFERENCES agent_session_thread(id) ON DELETE SET NULL,
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    verdict TEXT NOT NULL CHECK (verdict IN ('passed', 'revision_requested', 'failed')),
    summary TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(outcome_id, attempt)
);

ALTER TABLE agent_task_queue
    ADD COLUMN agent_session_id UUID REFERENCES agent_session(id) ON DELETE SET NULL,
    ADD COLUMN session_thread_id UUID REFERENCES agent_session_thread(id) ON DELETE SET NULL;

COMMENT ON COLUMN agent_task_queue.session_id IS
    'Legacy provider-native session identifier. Managed Execution uses agent_session_id and session_thread_id for product-level continuity.';

CREATE INDEX idx_agent_version_agent_created
    ON agent_version(agent_id, created_at DESC);
CREATE INDEX idx_agent_runtime_binding_agent_enabled
    ON agent_runtime_binding(agent_id, enabled, priority, runtime_id);
CREATE INDEX idx_agent_runtime_binding_runtime_enabled
    ON agent_runtime_binding(runtime_id, enabled);
CREATE INDEX idx_agent_session_issue_created
    ON agent_session(issue_id, created_at DESC);
CREATE INDEX idx_agent_session_workspace_status
    ON agent_session(workspace_id, status, updated_at DESC);
CREATE UNIQUE INDEX idx_agent_session_open_executor_agent
    ON agent_session(issue_id, entry_agent_id)
    WHERE mode = 'executor'
      AND entry_agent_id IS NOT NULL
      AND status NOT IN ('completed', 'failed', 'cancelled');
CREATE UNIQUE INDEX idx_agent_session_open_executor_squad
    ON agent_session(issue_id, entry_squad_id)
    WHERE mode IN ('executor', 'coordinator')
      AND entry_squad_id IS NOT NULL
      AND status NOT IN ('completed', 'failed', 'cancelled');
CREATE INDEX idx_agent_session_thread_session_created
    ON agent_session_thread(agent_session_id, created_at);
CREATE INDEX idx_agent_session_thread_runtime_status
    ON agent_session_thread(runtime_id, status);
CREATE INDEX idx_agent_session_event_session_seq
    ON agent_session_event(agent_session_id, seq);
CREATE INDEX idx_session_approval_session_status
    ON session_approval(agent_session_id, status, created_at DESC);
CREATE INDEX idx_outcome_evaluation_outcome_attempt
    ON outcome_evaluation(outcome_id, attempt);
CREATE INDEX idx_agent_task_queue_managed_session
    ON agent_task_queue(agent_session_id, created_at DESC)
    WHERE agent_session_id IS NOT NULL;

-- The current primary runtime becomes the first explicit binding. A lower
-- numeric priority wins; 0 intentionally marks the legacy preferred runtime.
INSERT INTO agent_runtime_binding (agent_id, runtime_id, priority, enabled, created_by)
SELECT a.id, a.runtime_id, 0, TRUE, a.owner_id
FROM agent a
WHERE a.runtime_id IS NOT NULL
ON CONFLICT (agent_id, runtime_id) DO NOTHING;

-- Snapshot every existing agent without copying custom_env or raw MCP values.
-- Only MCP server names and Composio toolkit slugs are retained in tool_config.
WITH snapshots AS (
    SELECT
        a.id AS agent_id,
        a.workspace_id,
        a.name,
        a.description,
        a.instructions,
        a.model,
        a.thinking_level,
        COALESCE(
            (SELECT jsonb_agg(ast.skill_id ORDER BY ast.skill_id::text)
             FROM agent_skill ast WHERE ast.agent_id = a.id),
            '[]'::jsonb
        ) AS skill_ids,
        jsonb_build_object(
            'mcp_server_names', COALESCE(
                (SELECT jsonb_agg(key ORDER BY key)
                 FROM jsonb_object_keys(COALESCE(a.mcp_config->'mcpServers', '{}'::jsonb)) AS key),
                '[]'::jsonb
            ),
            'composio_toolkits', to_jsonb(COALESCE(a.composio_toolkit_allowlist, ARRAY[]::text[])),
            'custom_args', COALESCE(a.custom_args, '[]'::jsonb)
        ) AS tool_config,
        COALESCE(a.runtime_config, '{}'::jsonb) AS runtime_config
    FROM agent a
), hashed AS (
    SELECT snapshots.*,
        encode(digest(convert_to(jsonb_build_object(
            'name', name,
            'description', description,
            'instructions', instructions,
            'model', model,
            'thinking_level', thinking_level,
            'skill_ids', skill_ids,
            'tool_config', tool_config,
            'runtime_config', runtime_config
        )::text, 'UTF8'), 'sha256'), 'hex') AS config_hash
    FROM snapshots
)
INSERT INTO agent_version (
    agent_id, workspace_id, version_number, name, description, instructions,
    model, thinking_level, skill_ids, tool_config, runtime_config, config_hash
)
SELECT
    agent_id, workspace_id, 1, name, description, instructions,
    model, thinking_level, skill_ids, tool_config, runtime_config, config_hash
FROM hashed
ON CONFLICT (agent_id, config_hash) DO NOTHING;

-- Convert only currently active, issue-linked executable work into managed
-- sessions. Terminal history remains Legacy and is still shown by the old task
-- timeline. Multiple active turns for the same issue/agent share one session.
WITH active_pairs AS (
    SELECT
        t.issue_id,
        t.agent_id,
        min(t.created_at) AS created_at,
        min(t.originator_user_id::text)::uuid AS created_by
    FROM agent_task_queue t
    JOIN issue i ON i.id = t.issue_id
    WHERE t.issue_id IS NOT NULL
      AND i.issue_type IN ('issue', 'subtask')
      AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory', 'deferred')
    GROUP BY t.issue_id, t.agent_id
)
INSERT INTO agent_session (
    workspace_id, issue_id, goal, mode, status, entry_agent_id,
    created_by, started_at, created_at, updated_at, metadata
)
SELECT
    i.workspace_id,
    p.issue_id,
    i.title,
    'executor',
    CASE
        WHEN EXISTS (
            SELECT 1 FROM agent_task_queue t
            WHERE t.issue_id = p.issue_id AND t.agent_id = p.agent_id AND t.status = 'running'
        ) THEN 'running'
        WHEN EXISTS (
            SELECT 1 FROM agent_task_queue t
            JOIN agent_runtime ar ON ar.id = t.runtime_id
            WHERE t.issue_id = p.issue_id AND t.agent_id = p.agent_id
              AND t.status IN ('queued', 'dispatched', 'waiting_local_directory', 'deferred')
              AND ar.status = 'online'
        ) THEN 'queued'
        ELSE 'waiting_environment'
    END,
    p.agent_id,
    p.created_by,
    CASE WHEN EXISTS (
        SELECT 1 FROM agent_task_queue t
        WHERE t.issue_id = p.issue_id AND t.agent_id = p.agent_id AND t.started_at IS NOT NULL
    ) THEN p.created_at ELSE NULL END,
    p.created_at,
    now(),
    jsonb_build_object('migrated_active_tasks', true)
FROM active_pairs p
JOIN issue i ON i.id = p.issue_id
ON CONFLICT DO NOTHING;

INSERT INTO agent_session_thread (
    agent_session_id, agent_id, agent_version_id, runtime_id, role, status,
    provider_session_id, work_dir, started_at, last_turn_at, created_at, updated_at
)
SELECT
    s.id,
    s.entry_agent_id,
    av.id,
    latest.runtime_id,
    'executor',
    s.status,
    latest.session_id,
    latest.work_dir,
    latest.started_at,
    latest.created_at,
    s.created_at,
    now()
FROM agent_session s
JOIN LATERAL (
    SELECT t.*
    FROM agent_task_queue t
    WHERE t.issue_id = s.issue_id AND t.agent_id = s.entry_agent_id
      AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory', 'deferred')
    ORDER BY t.created_at DESC
    LIMIT 1
) latest ON TRUE
JOIN LATERAL (
    SELECT v.id
    FROM agent_version v
    WHERE v.agent_id = s.entry_agent_id
    ORDER BY v.version_number DESC
    LIMIT 1
) av ON TRUE
WHERE s.metadata->>'migrated_active_tasks' = 'true';

UPDATE agent_task_queue t
SET agent_session_id = s.id,
    session_thread_id = st.id
FROM agent_session s
JOIN agent_session_thread st ON st.agent_session_id = s.id AND st.agent_id = s.entry_agent_id
WHERE t.issue_id = s.issue_id
  AND t.agent_id = s.entry_agent_id
  AND t.status IN ('queued', 'dispatched', 'running', 'waiting_local_directory', 'deferred')
  AND s.metadata->>'migrated_active_tasks' = 'true';

INSERT INTO agent_session_event (
    agent_session_id, thread_id, actor_type, actor_id, event_type, payload,
    visibility, source_task_id, idempotency_key, created_at
)
SELECT
    s.id,
    st.id,
    'system',
    NULL,
    'session.status_' || s.status,
    jsonb_build_object('status', s.status, 'migrated', true),
    'workspace',
    latest.id,
    'migration:155:session-created',
    s.created_at
FROM agent_session s
JOIN agent_session_thread st ON st.agent_session_id = s.id
JOIN LATERAL (
    SELECT t.id
    FROM agent_task_queue t
    WHERE t.agent_session_id = s.id
    ORDER BY t.created_at DESC
    LIMIT 1
) latest ON TRUE
WHERE s.metadata->>'migrated_active_tasks' = 'true';

-- Existing acceptance criteria become the first outcome rubric. Blank criteria
-- intentionally create no row; the service will still move successful work to
-- in_review without an evaluator loop.
INSERT INTO session_outcome (agent_session_id, rubric_markdown, status, max_iterations, created_by)
SELECT s.id, i.acceptance_criteria, 'pending', s.max_iterations, s.created_by
FROM agent_session s
JOIN issue i ON i.id = s.issue_id
WHERE NULLIF(btrim(i.acceptance_criteria), '') IS NOT NULL
ON CONFLICT (agent_session_id) DO NOTHING;
