import { describe, expect, it } from "vitest";
import type { InboxItem } from "@ohmyagentteam/core/types";
import { countInboxViews, matchesInboxView } from "./inbox-filter";

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: "inbox-1",
    workspace_id: "workspace-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: "member",
    actor_id: "member-2",
    type: "new_comment",
    severity: "info",
    issue_id: "issue-1",
    title: "Update",
    body: null,
    issue_status: "todo",
    read: false,
    archived: false,
    created_at: "2026-07-10T00:00:00Z",
    details: null,
    ...overrides,
  };
}

describe("inbox action center filters", () => {
  it("keeps action-required events in the action view", () => {
    expect(matchesInboxView(item({ severity: "action_required" }), "action")).toBe(true);
    expect(matchesInboxView(item({ type: "review_requested" }), "action")).toBe(true);
    expect(matchesInboxView(item({ type: "new_comment" }), "action")).toBe(false);
  });

  it("recognizes agent and system events even when the actor is absent", () => {
    expect(matchesInboxView(item({ actor_type: null, type: "agent_blocked" }), "agents")).toBe(true);
    expect(matchesInboxView(item({ actor_type: null, type: "status_changed" }), "system")).toBe(true);
  });

  it("counts each view independently", () => {
    const counts = countInboxViews([
      item({ id: "1", type: "issue_assigned", severity: "action_required" }),
      item({ id: "2", actor_type: "agent", type: "agent_completed" }),
      item({ id: "3", actor_type: "system", type: "status_changed" }),
    ]);
    expect(counts).toEqual({ all: 3, action: 1, agents: 1, system: 1 });
  });
});
