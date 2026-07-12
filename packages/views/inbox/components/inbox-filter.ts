import type { InboxItem, InboxItemType } from "@ohmyagentteam/core/types";

export type InboxView = "all" | "action" | "agents" | "system";

const ACTION_TYPES = new Set<InboxItemType>([
  "issue_assigned",
  "mentioned",
  "review_requested",
  "task_failed",
  "agent_blocked",
  "quick_create_failed",
]);

const AGENT_TYPES = new Set<InboxItemType>([
  "task_completed",
  "task_failed",
  "agent_blocked",
  "agent_completed",
]);

const SYSTEM_TYPES = new Set<InboxItemType>([
  "issue_subscribed",
  "unassigned",
  "assignee_changed",
  "status_changed",
  "priority_changed",
  "start_date_changed",
  "due_date_changed",
  "quick_create_done",
  "quick_create_failed",
]);

export function matchesInboxView(item: InboxItem, view: InboxView): boolean {
  if (view === "all") return true;
  if (view === "action") {
    return item.severity === "action_required" || ACTION_TYPES.has(item.type);
  }
  if (view === "agents") {
    return item.actor_type === "agent" || AGENT_TYPES.has(item.type);
  }
  return item.actor_type === "system" || SYSTEM_TYPES.has(item.type);
}

export function countInboxViews(items: InboxItem[]): Record<InboxView, number> {
  return {
    all: items.length,
    action: items.filter((item) => matchesInboxView(item, "action")).length,
    agents: items.filter((item) => matchesInboxView(item, "agents")).length,
    system: items.filter((item) => matchesInboxView(item, "system")).length,
  };
}
