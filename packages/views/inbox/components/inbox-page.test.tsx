/**
 * @vitest-environment jsdom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@ohmyagentteam/core/types";
import { renderWithI18n } from "../../test/i18n";
import { InboxPage } from "./inbox-page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  markRead: vi.fn(),
  archive: vi.fn(),
}));

const epicOwnedItem: InboxItem = {
  id: "inbox-epic-1",
  workspace_id: "ws-1",
  recipient_type: "member",
  recipient_id: "member-1",
  actor_type: "member",
  actor_id: "member-1",
  type: "epic_owned",
  severity: "info",
  issue_id: null,
  target_type: "epic",
  target_id: "epic-1",
  title: "Epic planning ownership",
  body: null,
  issue_status: null,
  read: false,
  archived: false,
  created_at: "2026-07-12T00:00:00Z",
  details: null,
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: [epicOwnedItem], isLoading: false }),
  };
});

vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}));

vi.mock("@ohmyagentteam/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@ohmyagentteam/core/paths", () => ({
  useWorkspacePaths: () => ({
    inbox: () => "/my/inbox",
    epicDetail: (id: string) => `/my/epics/${id}`,
    issueDetail: (id: string) => `/my/issues/${id}`,
  }),
}));
vi.mock("@ohmyagentteam/core/inbox/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ohmyagentteam/core/inbox/queries")>();
  return {
    ...actual,
    inboxListOptions: () => ({ queryKey: ["inbox"] }),
    useInboxUnreadCount: () => 1,
  };
});
vi.mock("@ohmyagentteam/core/inbox/mutations", () => ({
  useMarkInboxRead: () => ({ mutate: mocks.markRead }),
  useArchiveInbox: () => ({ mutate: mocks.archive }),
  useMarkAllInboxRead: () => ({ mutate: vi.fn() }),
  useArchiveAllInbox: () => ({ mutate: vi.fn() }),
  useArchiveAllReadInbox: () => ({ mutate: vi.fn() }),
  useArchiveCompletedInbox: () => ({ mutate: vi.fn() }),
}));
vi.mock("@ohmyagentteam/ui/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("../../navigation", () => ({
  useNavigation: () => ({
    searchParams: new URLSearchParams(),
    replace: mocks.replace,
  }),
}));
vi.mock("../../epics/components", () => ({
  EpicDetail: ({ epicId }: { epicId: string }) => (
    <div data-testid="epic-detail">Epic detail {epicId}</div>
  ),
}));
vi.mock("../../issues/components", () => ({
  IssueDetailEntry: () => <div>Issue detail</div>,
}));
vi.mock("./inbox-list-item", () => ({
  InboxListItem: ({ item, onClick }: { item: InboxItem; onClick: () => void }) => (
    <button type="button" onClick={onClick}>{item.title}</button>
  ),
  useTimeAgo: () => () => "now",
}));
vi.mock("./inbox-detail-label", () => ({ useTypeLabels: () => ({}) }));
vi.mock("../../layout/page-header", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("InboxPage typed target selection", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.markRead.mockReset();
    mocks.archive.mockReset();
  });

  it("keeps an Epic notification selected, marks it read, and does not fall through to a direct redirect", async () => {
    renderWithI18n(<InboxPage />);

    fireEvent.click(screen.getByRole("button", { name: "Epic planning ownership" }));

    expect(await screen.findByTestId("epic-detail")).toHaveTextContent("epic-1");
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith("inbox-epic-1", expect.any(Object)));
    expect(mocks.replace).toHaveBeenCalledWith("/my/inbox?issue=epic-1&type=epic");
    expect(mocks.replace).not.toHaveBeenCalledWith("/my/epics/epic-1");
  });
});
