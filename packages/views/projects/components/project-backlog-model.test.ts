import { describe, expect, it } from "vitest";
import type { Epic, Issue, IssueStatus, IssueType } from "@ohmyagentteam/core/types";
import { buildProjectBacklogModel } from "./project-backlog-model";

function issue(
  id: string,
  issueType: IssueType,
  status: IssueStatus,
  overrides: Partial<Issue> = {},
): Issue {
  return {
    id,
    workspace_id: "workspace-1",
    number: 1,
    identifier: id.toUpperCase(),
    issue_type: issueType,
    epic_id: null,
    title: id,
    description: null,
    status,
    priority: "none",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "member-1",
    parent_issue_id: null,
    project_id: "project-1",
    position: 0,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

function epic(id: string, lifecycle: Epic["lifecycle"] = "planned"): Epic {
  return {
    id,
    workspace_id: "workspace-1",
    project_id: "project-1",
    number: 1,
    identifier: id.toUpperCase(),
    title: id,
    description: null,
    success_criteria: null,
    lifecycle,
    health: null,
    priority: "none",
    owner_type: null,
    owner_id: null,
    start_date: null,
    target_date: null,
    creator_type: "member",
    creator_id: "member-1",
    total_issues: 0,
    done_issues: 0,
    blocked_issues: 0,
    completion_percent: 0,
    status_distribution: {},
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
  };
}

describe("buildProjectBacklogModel", () => {
  it("keeps a backlog subtask visible when its parent issue is already active", () => {
    const model = buildProjectBacklogModel([
      issue("parent-1", "issue", "todo", { epic_id: "epic-1" }),
      issue("subtask-1", "subtask", "backlog", {
        epic_id: "epic-1",
        parent_issue_id: "parent-1",
      }),
      issue("subtask-done", "subtask", "done", {
        epic_id: "epic-1",
        parent_issue_id: "parent-1",
      }),
    ], [epic("epic-1")]);

    expect(model.byEpic.get("epic-1")?.map((item) => item.id)).toEqual([
      "parent-1",
    ]);
    expect(model.subtasksByParent.get("parent-1")?.map((item) => item.id)).toEqual([
      "subtask-1",
    ]);
    expect(model.backlogIssueCount).toBe(0);
  });

  it("surfaces backlog subtasks whose parent is missing", () => {
    const model = buildProjectBacklogModel([
      issue("orphan", "subtask", "backlog", {
        parent_issue_id: "missing-parent",
      }),
    ]);

    expect(model.orphanedSubtasks.map((item) => item.id)).toEqual(["orphan"]);
  });

  it("moves children of a cancelled epic into the ungrouped section", () => {
    const model = buildProjectBacklogModel([
      issue("issue-1", "issue", "backlog", { epic_id: "epic-cancelled" }),
    ], [epic("epic-cancelled", "cancelled")]);

    expect(model.epics).toHaveLength(0);
    expect(model.ungrouped.map((item) => item.id)).toEqual(["issue-1"]);
  });
});
