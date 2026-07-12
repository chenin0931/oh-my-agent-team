import type { Epic, Issue } from "@ohmyagentteam/core/types";

export interface ProjectBacklogModel {
  epics: Epic[];
  visibleIssues: Issue[];
  backlogIssueCount: number;
  backlogSubtasks: Issue[];
  subtasksByParent: Map<string | null, Issue[]>;
  byEpic: Map<string | null, Issue[]>;
  ungrouped: Issue[];
  orphanedSubtasks: Issue[];
}

export function buildProjectBacklogModel(issues: Issue[], allEpics: Epic[] = []): ProjectBacklogModel {
  const epics = allEpics.filter((epic) => epic.lifecycle !== "cancelled");
  const epicIds = new Set(epics.map((epic) => epic.id));
  const allIssues = issues.filter(
    (issue) => (issue.issue_type ?? "issue") === "issue",
  );
  const issueIds = new Set(allIssues.map((issue) => issue.id));
  const backlogSubtasks = issues.filter(
    (issue) => issue.issue_type === "subtask" && issue.status === "backlog",
  );
  const subtasksByParent = groupBy(
    backlogSubtasks,
    (issue) => issue.parent_issue_id,
  );
  const visibleIssues = allIssues.filter(
    (issue) =>
      issue.status === "backlog" || subtasksByParent.has(issue.id),
  );
  const byEpic = groupBy(visibleIssues, (issue) =>
    issue.epic_id && epicIds.has(issue.epic_id) ? issue.epic_id : null,
  );

  return {
    epics,
    visibleIssues,
    backlogIssueCount: allIssues.filter((issue) => issue.status === "backlog")
      .length,
    backlogSubtasks,
    subtasksByParent,
    byEpic,
    ungrouped: byEpic.get(null) ?? [],
    orphanedSubtasks: backlogSubtasks.filter(
      (subtask) =>
        !subtask.parent_issue_id || !issueIds.has(subtask.parent_issue_id),
    ),
  };
}

function groupBy(
  items: Issue[],
  key: (item: Issue) => string | null | undefined,
) {
  const result = new Map<string | null, Issue[]>();
  for (const item of items) {
    const value = key(item) ?? null;
    result.set(value, [...(result.get(value) ?? []), item]);
  }
  return result;
}
