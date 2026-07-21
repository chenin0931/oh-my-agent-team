export type AgentSessionMode =
  | "executor"
  | "advisor"
  | "coordinator"
  | "reviewer"
  | "planning";

export type AgentSessionStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "waiting_environment"
  | "idle"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentSessionThread {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_version_id: string;
  agent_version_number: number;
  runtime_id?: string;
  runtime_name?: string;
  runtime_provider?: string;
  runtime_status?: string;
  parent_thread_id?: string;
  role: "executor" | "advisor" | "coordinator" | "reviewer" | "planner";
  status: AgentSessionStatus;
  has_provider_session: boolean;
  permission_policy: Record<string, "allow" | "ask" | "deny">;
  stop_reason?: string;
  started_at?: string;
  completed_at?: string;
  last_turn_at?: string;
  created_at: string;
}

export interface SessionApproval {
  id: string;
  thread_id?: string;
  action_namespace: string;
  operation_fingerprint: string;
  title: string;
  details: Record<string, unknown>;
  risk_level: "medium" | "high" | "critical" | string;
  status: "pending" | "approved" | "rejected" | "consumed" | "cancelled" | "expired";
  decision_reason?: string;
  expires_at: string;
  resolved_at?: string;
  created_at: string;
}

export interface OutcomeEvaluation {
  id: string;
  attempt: number;
  verdict: "passed" | "revision_requested" | "failed" | string;
  summary: string;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface SessionOutcome {
  id: string;
  rubric_markdown: string;
  status: "pending" | "evaluating" | "passed" | "revision_requested" | "waiting_input" | "cancelled";
  max_iterations: number;
  current_iteration: number;
  completed_at?: string;
  evaluations: OutcomeEvaluation[];
}

export interface AgentSessionTask {
  id: string;
  thread_id?: string;
  status: string;
  attempt: number;
  max_attempts: number;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface AgentSession {
  id: string;
  workspace_id: string;
  issue_id?: string;
  issue_title?: string;
  goal: string;
  mode: AgentSessionMode;
  status: AgentSessionStatus;
  entry_agent_id?: string;
  entry_squad_id?: string;
  stop_reason?: string;
  iteration_count: number;
  max_iterations: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  threads: AgentSessionThread[];
  approvals?: SessionApproval[];
  outcome?: SessionOutcome;
  tasks?: AgentSessionTask[];
}

export interface AgentVersionSummary {
  id: string;
  version_number: number;
  config_hash: string;
  model?: string;
  thinking_level?: string;
  skill_count: number;
  created_at: string;
}

export interface AgentSessionEvent {
  id: string;
  seq: number;
  agent_session_id: string;
  issue_id?: string;
  entry_squad_id?: string;
  thread_id?: string;
  actor_type: "member" | "agent" | "system" | string;
  actor_id?: string;
  event_type: string;
  payload: Record<string, unknown>;
  source_task_id?: string;
  created_at: string;
}

export interface AgentSessionEventsResponse {
  events: AgentSessionEvent[];
  next_seq: number;
}

export type PostAgentSessionEventRequest =
  | { type: "user.message"; message: string }
  | { type: "user.interrupt"; reason?: string }
  | { type: "user.define_outcome"; rubric: string }
  | {
      type: "user.approval_decision";
      approval_id: string;
      decision: "approve" | "reject";
      reason?: string;
    };

export interface AgentExecutionBinding {
  id: string;
  runtime_id: string;
  runtime_name: string;
  provider: string;
  profile_id?: string;
  daemon_id?: string;
  priority: number;
  enabled: boolean;
  status: string;
  active_task_count: number;
}

export interface UpsertAgentExecutionBindingRequest {
  runtime_id: string;
  priority: number;
  enabled?: boolean;
}
