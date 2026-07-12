import type { Attachment } from "./attachment";
import type { Issue, IssuePriority } from "./issue";
import type { Label } from "./label";

export type EpicLifecycle =
  | "planned"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

export type EpicHealth = "on_track" | "at_risk" | "off_track";
export type EpicOwnerType = "member" | "agent";

export interface Epic {
  id: string;
  workspace_id: string;
  project_id: string;
  number: number;
  identifier: string;
  title: string;
  description: string | null;
  success_criteria: string | null;
  lifecycle: EpicLifecycle;
  health: EpicHealth | null;
  priority: IssuePriority;
  owner_type: EpicOwnerType | null;
  owner_id: string | null;
  start_date: string | null;
  target_date: string | null;
  creator_type: "member" | "agent";
  creator_id: string;
  total_issues: number;
  done_issues: number;
  blocked_issues: number;
  completion_percent: number;
  status_distribution: Record<string, number>;
  labels?: Label[];
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface ListEpicsResponse {
  epics: Epic[];
  total: number;
}

export interface ListEpicsParams {
  project_id?: string;
  lifecycle?: EpicLifecycle;
  owner_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEpicRequest {
  title: string;
  project_id: string;
  description?: string | null;
  success_criteria?: string | null;
  health?: EpicHealth | null;
  priority?: IssuePriority;
  owner_type?: EpicOwnerType | null;
  owner_id?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  attachment_ids?: string[];
}

export interface UpdateEpicRequest extends Partial<CreateEpicRequest> {
  lifecycle?: EpicLifecycle;
}

export interface EpicWorkItemsResponse {
  issues: Issue[];
}

export interface QuickCreateCreatedItem {
  id: string;
  identifier: string;
  title: string;
  target_type: "epic" | "issue";
  item_type: "epic" | "issue" | "subtask";
  status: string;
  assignee_type?: string | null;
  assignee_id?: string | null;
}
