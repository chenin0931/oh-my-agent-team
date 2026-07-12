import { describe, expect, it } from "vitest";
import type { InboxItem, InboxWorkspaceUnread } from "../types";
import { deduplicateInboxItems, hasOtherWorkspaceUnread, inboxKeys, unreadWorkspaceIds } from "./queries";

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: "inbox-1",
    workspace_id: "workspace-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: "agent",
    actor_id: "agent-1",
    type: "new_comment",
    severity: "info",
    issue_id: "issue-1",
    title: "Issue title",
    body: null,
    issue_status: null,
    read: false,
    archived: false,
    created_at: "2026-06-15T08:00:00Z",
    details: null,
    ...overrides,
  };
}

describe("deduplicateInboxItems", () => {
  it("keeps the newest issue row while preserving an older comment anchor", () => {
    const merged = deduplicateInboxItems([
      item({
        id: "comment-notification",
        type: "new_comment",
        created_at: "2026-06-15T08:00:00Z",
        details: { comment_id: "comment-1" },
      }),
      item({
        id: "status-notification",
        type: "status_changed",
        created_at: "2026-06-15T08:01:00Z",
        details: { from: "in_progress", to: "in_review" },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "status-notification",
      type: "status_changed",
      details: {
        from: "in_progress",
        to: "in_review",
        comment_id: "comment-1",
      },
    });
  });

  it("preserves the newest row's own comment anchor", () => {
    const merged = deduplicateInboxItems([
      item({
        id: "older-comment",
        created_at: "2026-06-15T08:00:00Z",
        details: { comment_id: "comment-1" },
      }),
      item({
        id: "newer-comment",
        created_at: "2026-06-15T08:02:00Z",
        details: { comment_id: "comment-2" },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("newer-comment");
    expect(merged[0]?.details?.comment_id).toBe("comment-2");
  });

  it("keeps an unread assignment visible above newer agent comments", () => {
    const merged = deduplicateInboxItems([
      item({
        id: "assignment",
        type: "issue_assigned",
        severity: "action_required",
        actor_type: "agent",
        created_at: "2026-06-15T08:00:00Z",
      }),
      item({
        id: "advisor-comment",
        type: "new_comment",
        severity: "info",
        actor_type: "agent",
        created_at: "2026-06-15T08:02:00Z",
        details: { comment_id: "comment-2" },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "assignment",
      type: "issue_assigned",
      severity: "action_required",
    });
    expect(merged[0]?.details?.comment_id).toBeUndefined();
  });

  it("returns to the newest update after the action is read", () => {
    const merged = deduplicateInboxItems([
      item({
        id: "assignment",
        type: "issue_assigned",
        severity: "action_required",
        read: true,
        created_at: "2026-06-15T08:00:00Z",
      }),
      item({
        id: "advisor-comment",
        type: "new_comment",
        created_at: "2026-06-15T08:02:00Z",
      }),
    ]);

    expect(merged[0]?.id).toBe("advisor-comment");
  });

  it("replaces a failed quick-create attempt with its newer successful retry", () => {
    const prompt = "Plan a customer roundtable";
    const merged = deduplicateInboxItems([
      item({
        id: "failed-attempt",
        issue_id: null,
        type: "quick_create_failed",
        severity: "action_required",
        created_at: "2026-06-15T08:00:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
      item({
        id: "successful-retry",
        issue_id: "issue-2",
        type: "quick_create_done",
        severity: "info",
        created_at: "2026-06-15T08:02:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("successful-retry");
  });

  it("surfaces a newer quick-create failure after an older success", () => {
    const prompt = "Plan a customer roundtable";
    const merged = deduplicateInboxItems([
      item({
        id: "older-success",
        issue_id: "issue-2",
        type: "quick_create_done",
        created_at: "2026-06-15T08:00:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
      item({
        id: "newer-failure",
        issue_id: null,
        type: "quick_create_failed",
        severity: "action_required",
        created_at: "2026-06-15T08:02:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("newer-failure");
  });

  it("still preserves a human assignment after a quick-create retry succeeds", () => {
    const prompt = "Plan a customer roundtable";
    const merged = deduplicateInboxItems([
      item({
        id: "failed-attempt",
        issue_id: null,
        type: "quick_create_failed",
        severity: "action_required",
        created_at: "2026-06-15T08:00:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
      item({
        id: "assignment",
        issue_id: "issue-2",
        type: "issue_assigned",
        severity: "action_required",
        created_at: "2026-06-15T08:01:00Z",
      }),
      item({
        id: "successful-retry",
        issue_id: "issue-2",
        type: "quick_create_done",
        created_at: "2026-06-15T08:02:00Z",
        details: { agent_id: "agent-1", original_prompt: prompt },
      }),
      item({
        id: "advisor-comment",
        issue_id: "issue-2",
        type: "new_comment",
        created_at: "2026-06-15T08:03:00Z",
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("assignment");
  });
});

describe("hasOtherWorkspaceUnread", () => {
  const summary = (entries: InboxWorkspaceUnread[]) => entries;

  it("is true when a workspace other than the active one has unread", () => {
    expect(
      hasOtherWorkspaceUnread(
        summary([{ workspace_id: "ws-2", count: 3 }]),
        "ws-1",
      ),
    ).toBe(true);
  });

  it("excludes the active workspace's own unread", () => {
    expect(
      hasOtherWorkspaceUnread(
        summary([{ workspace_id: "ws-1", count: 5 }]),
        "ws-1",
      ),
    ).toBe(false);
  });

  it("ignores other workspaces whose count is zero", () => {
    expect(
      hasOtherWorkspaceUnread(
        summary([{ workspace_id: "ws-2", count: 0 }]),
        "ws-1",
      ),
    ).toBe(false);
  });

  it("is true when at least one non-active workspace has unread", () => {
    expect(
      hasOtherWorkspaceUnread(
        summary([
          { workspace_id: "ws-1", count: 4 },
          { workspace_id: "ws-2", count: 1 },
        ]),
        "ws-1",
      ),
    ).toBe(true);
  });

  it("is false for an empty summary", () => {
    expect(hasOtherWorkspaceUnread([], "ws-1")).toBe(false);
  });

  it("counts every workspace as 'other' when there is no active workspace", () => {
    expect(
      hasOtherWorkspaceUnread(
        summary([{ workspace_id: "ws-1", count: 2 }]),
        null,
      ),
    ).toBe(true);
  });
});

describe("unreadWorkspaceIds", () => {
  it("collects only workspaces with a non-zero count", () => {
    const ids = unreadWorkspaceIds([
      { workspace_id: "ws-1", count: 0 },
      { workspace_id: "ws-2", count: 3 },
      { workspace_id: "ws-3", count: 1 },
    ]);
    expect(ids.has("ws-1")).toBe(false);
    expect(ids.has("ws-2")).toBe(true);
    expect(ids.has("ws-3")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("returns an empty set for an empty summary", () => {
    expect(unreadWorkspaceIds([]).size).toBe(0);
  });
});

describe("inboxKeys.unreadSummary", () => {
  it("is a stable account-level key independent of any workspace", () => {
    expect(inboxKeys.unreadSummary()).toEqual(["inbox", "unread-summary"]);
  });
});
