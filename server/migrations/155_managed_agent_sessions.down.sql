ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS session_thread_id,
    DROP COLUMN IF EXISTS agent_session_id;

DROP TABLE IF EXISTS outcome_evaluation;
DROP TABLE IF EXISTS session_outcome;
DROP TABLE IF EXISTS session_approval;
DROP TABLE IF EXISTS agent_session_event;
DROP TABLE IF EXISTS agent_session_thread;
DROP TABLE IF EXISTS agent_session;
DROP TABLE IF EXISTS agent_runtime_binding;
DROP TABLE IF EXISTS agent_version;
