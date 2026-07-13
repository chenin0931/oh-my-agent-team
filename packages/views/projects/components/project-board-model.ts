import type { Issue } from "@ohmyagentteam/core/types";

export function isProjectBoardItem(issue: Pick<Issue, "issue_type">) {
  return issue.issue_type !== "epic";
}
