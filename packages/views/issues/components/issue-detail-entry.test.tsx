import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IssueDetailEntry } from "./issue-detail-entry";

const { queryData, replace } = vi.hoisted(() => ({
  queryData: { current: null as null | { issue_type?: string } },
  replace: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: queryData.current }),
}));
vi.mock("@ohmyagentteam/core/issues/queries", () => ({
  issueDetailOptions: () => ({ queryKey: ["issue-detail"] }),
}));
vi.mock("@ohmyagentteam/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@ohmyagentteam/core/paths", () => ({
  useWorkspacePaths: () => ({ epicDetail: (id: string) => `/acme/epics/${id}` }),
}));
vi.mock("../../navigation", () => ({
  useNavigation: () => ({ replace }),
}));
vi.mock("./issue-detail", () => ({
  IssueDetail: ({ issueId }: { issueId: string }) => <div data-testid="issue-detail">{issueId}</div>,
}));

describe("IssueDetailEntry", () => {
  beforeEach(() => {
    queryData.current = null;
    replace.mockReset();
  });

  it("redirects legacy Epic links without rendering execution UI", async () => {
    queryData.current = { issue_type: "epic" };
    render(<IssueDetailEntry issueId="epic-1" />);

    expect(screen.queryByTestId("issue-detail")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/acme/epics/epic-1"));
  });

  it("renders the shared collaboration detail for executable work", () => {
    queryData.current = { issue_type: "issue" };
    render(<IssueDetailEntry issueId="issue-1" />);

    expect(screen.getByTestId("issue-detail")).toHaveTextContent("issue-1");
    expect(replace).not.toHaveBeenCalled();
  });
});
