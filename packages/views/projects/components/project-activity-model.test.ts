import { describe, expect, it } from "vitest";
import type { ProjectActivityItem } from "@ohmyagentteam/core/types";
import { deduplicateProjectActivity } from "./project-activity-model";

function activity(overrides: Partial<ProjectActivityItem>): ProjectActivityItem {
  return {
    id: "activity-1",
    target_type: "issue",
    target_id: "issue-1",
    issue_id: "issue-1",
    issue_identifier: "MY-1",
    issue_title: "Work item",
    actor_type: "agent",
    actor_id: "agent-1",
    kind: "run",
    action: "task_completed",
    body: null,
    details: {},
    created_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

describe("deduplicateProjectActivity", () => {
  it("collapses duplicate semantic events with different database ids", () => {
    const items = deduplicateProjectActivity([
      activity({ id: "activity-2", kind: "system" }),
      activity({ id: "activity-1" }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("activity-2");
  });

  it("keeps distinct comments and lifecycle events", () => {
    const items = deduplicateProjectActivity([
      activity({ id: "comment-2", kind: "comment", action: "comment_created", body: "Second" }),
      activity({ id: "comment-1", kind: "comment", action: "comment_created", body: "First" }),
      activity({ id: "run-1", action: "task_running" }),
    ]);

    expect(items).toHaveLength(3);
  });
});
