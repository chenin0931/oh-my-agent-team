import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Issue } from "@ohmyagentteam/core/types";
import { I18nProvider } from "@ohmyagentteam/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enIssues from "../../locales/en/issues.json";

const TEST_RESOURCES = { en: { common: enCommon, issues: enIssues } };
vi.mock("@ohmyagentteam/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @ohmyagentteam/core/auth
const mockAuthUser = { id: "user-1", email: "test@test.com", name: "Test User" };
vi.mock("@ohmyagentteam/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = { user: mockAuthUser, isAuthenticated: true };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ user: mockAuthUser, isAuthenticated: true }) },
  ),
  registerAuthStore: vi.fn(),
  createAuthStore: vi.fn(),
}));

// Mock @ohmyagentteam/core/paths — after the URL-driven workspace refactor,
// useCurrentWorkspace derives from the workspace slug in URL Context. Tests
// don't mount a real route, so we short-circuit to a fixed fixture.
vi.mock("@ohmyagentteam/core/paths", async () => {
  const actual = await vi.importActual<typeof import("@ohmyagentteam/core/paths")>(
    "@ohmyagentteam/core/paths",
  );
  return {
    ...actual,
    useCurrentWorkspace: () => ({ id: "ws-1", name: "Test WS", slug: "test" }),
    useWorkspacePaths: () => actual.paths.workspace("test"),
  };
});

// Mock @ohmyagentteam/views/navigation (AppLink + useNavigation)
vi.mock("../../navigation", () => ({
  AppLink: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useNavigation: () => ({ push: vi.fn(), pathname: "/issues" }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock workspace avatar
vi.mock("../../workspace/workspace-avatar", () => ({
  WorkspaceAvatar: ({ name }: { name: string }) => <span data-testid="workspace-avatar">{name.charAt(0)}</span>,
}));

// Mock api (queries use api internally)
const mockListIssues = vi.hoisted(() => vi.fn().mockResolvedValue({ issues: [], total: 0 }));
const mockListGroupedIssues = vi.hoisted(() => vi.fn().mockResolvedValue({ groups: [] }));
const mockListProjects = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    projects: [
      {
        id: "project-1",
        workspace_id: "ws-1",
        title: "Website launch",
        description: null,
        icon: null,
        status: "planned",
        priority: "none",
        lead_type: null,
        lead_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        issue_count: 3,
        done_count: 1,
        resource_count: 0,
      },
    ],
    total: 1,
  }),
);
const mockSetViewState = vi.hoisted(() => vi.fn());
const mockListMembers = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: "member-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      role: "member",
      created_at: "2026-01-01T00:00:00Z",
      name: "Test User",
      email: "test@test.com",
      avatar_url: null,
    },
  ]),
);
const mockListAgents = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: "agent-1",
      workspace_id: "ws-1",
      name: "Agent One",
      description: "",
      instructions: "",
      status: "idle",
      runtime_id: "runtime-1",
      owner_id: "user-1",
      avatar_url: null,
      visibility: "workspace",
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ]),
);
const mockListRuntimes = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: "runtime-1",
      workspace_id: "ws-1",
      name: "Runtime One",
      owner_id: "user-1",
      status: "online",
      metadata: { cli_version: "0.3.43" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ]),
);
const mockQuickCreateIssue = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ task_id: "task-1" }),
);
const mockGetQuickCreateIssueStatus = vi.hoisted(() => vi.fn());
const mockGetIssue = vi.hoisted(() => vi.fn());
const mockListInbox = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockListSquads = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: "squad-1",
      workspace_id: "ws-1",
      name: "Squad One",
      description: "",
      instructions: "",
      avatar_url: null,
      leader_id: "agent-1",
      creator_id: "user-1",
      archived_at: null,
      archived_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ]),
);
vi.mock("@ohmyagentteam/core/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    statusText: string;
    body?: unknown;

    constructor(message: string, status: number, statusText: string, body?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.statusText = statusText;
      this.body = body;
    }
  },
  api: {
    getBaseUrl: () => "http://127.0.0.1:8080",
    listIssues: (...args: any[]) => mockListIssues(...args),
    listGroupedIssues: (...args: any[]) => mockListGroupedIssues(...args),
    listProjects: (...args: any[]) => mockListProjects(...args),
    updateIssue: vi.fn(),
    listMembers: (...args: any[]) => mockListMembers(...args),
    listAgents: (...args: any[]) => mockListAgents(...args),
    listRuntimes: (...args: any[]) => mockListRuntimes(...args),
    listSquads: (...args: any[]) => mockListSquads(...args),
    quickCreateIssue: (...args: any[]) => mockQuickCreateIssue(...args),
    getQuickCreateIssueStatus: (...args: any[]) =>
      mockGetQuickCreateIssueStatus(...args),
    getIssue: (...args: any[]) => mockGetIssue(...args),
    listInbox: (...args: any[]) => mockListInbox(...args),
  },
  getApi: () => ({
    listIssues: (...args: any[]) => mockListIssues(...args),
    listGroupedIssues: (...args: any[]) => mockListGroupedIssues(...args),
    listProjects: (...args: any[]) => mockListProjects(...args),
    updateIssue: vi.fn(),
    listMembers: (...args: any[]) => mockListMembers(...args),
    listAgents: (...args: any[]) => mockListAgents(...args),
    listRuntimes: (...args: any[]) => mockListRuntimes(...args),
    listSquads: (...args: any[]) => mockListSquads(...args),
    quickCreateIssue: (...args: any[]) => mockQuickCreateIssue(...args),
    getQuickCreateIssueStatus: (...args: any[]) =>
      mockGetQuickCreateIssueStatus(...args),
    getIssue: (...args: any[]) => mockGetIssue(...args),
    listInbox: (...args: any[]) => mockListInbox(...args),
  }),
  setApiInstance: vi.fn(),
}));

// Mock issue config
vi.mock("@ohmyagentteam/core/issues/config", () => ({
  ALL_STATUSES: ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"],
  BOARD_STATUSES: ["backlog", "todo", "in_progress", "in_review", "done", "blocked"],
  STATUS_ORDER: ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"],
  STATUS_CONFIG: {
    backlog: { label: "Backlog", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent" },
    todo: { label: "Todo", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent" },
    in_progress: { label: "In Progress", iconColor: "text-warning", hoverBg: "hover:bg-warning/10" },
    in_review: { label: "In Review", iconColor: "text-success", hoverBg: "hover:bg-success/10" },
    done: { label: "Done", iconColor: "text-info", hoverBg: "hover:bg-info/10" },
    blocked: { label: "Blocked", iconColor: "text-destructive", hoverBg: "hover:bg-destructive/10" },
    cancelled: { label: "Cancelled", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent" },
  },
  PRIORITY_ORDER: ["urgent", "high", "medium", "low", "none"],
  PRIORITY_CONFIG: {
    urgent: { label: "Urgent", bars: 4, color: "text-destructive" },
    high: { label: "High", bars: 3, color: "text-warning" },
    medium: { label: "Medium", bars: 2, color: "text-warning" },
    low: { label: "Low", bars: 1, color: "text-info" },
    none: { label: "No priority", bars: 0, color: "text-muted-foreground" },
  },
}));

// Mock view store
const mockViewState = {
  viewMode: "board" as "board" | "list",
  grouping: "status" as "status" | "assignee",
  statusFilters: [] as string[],
  priorityFilters: [] as string[],
  assigneeFilters: [] as { type: string; id: string }[],
  includeNoAssignee: false,
  creatorFilters: [] as { type: string; id: string }[],
  projectFilters: [] as string[],
  includeNoProject: false,
  labelFilters: [] as string[],
  sortBy: "position" as const,
  sortDirection: "asc" as const,
  cardProperties: { priority: true, description: true, assignee: true, dueDate: true, project: true, childProgress: true, labels: true },
  listCollapsedStatuses: [] as string[],
  setViewMode: vi.fn(),
  setGrouping: vi.fn(),
  toggleStatusFilter: vi.fn(),
  togglePriorityFilter: vi.fn(),
  toggleAssigneeFilter: vi.fn(),
  toggleNoAssignee: vi.fn(),
  toggleCreatorFilter: vi.fn(),
  toggleProjectFilter: vi.fn(),
  toggleNoProject: vi.fn(),
  toggleLabelFilter: vi.fn(),
  hideStatus: vi.fn(),
  showStatus: vi.fn(),
  clearFilters: vi.fn(),
  setSortBy: vi.fn(),
  setSortDirection: vi.fn(),
  toggleCardProperty: vi.fn(),
  toggleListCollapsed: vi.fn(),
};

vi.mock("@ohmyagentteam/core/issues/stores/view-store", () => ({
  useClearFiltersOnWorkspaceChange: () => {},
  viewStorePersistOptions: () => ({ name: "test", storage: undefined, partialize: (s: any) => s }),
  mergeViewStatePersisted: (_p: unknown, c: any) => c,
  viewStoreSlice: vi.fn(),
  useIssueViewStore: Object.assign(
    (selector?: any) => (selector ? selector(mockViewState) : mockViewState),
    { getState: () => mockViewState, setState: vi.fn() },
  ),
  createIssueViewStore: () => ({
    getState: () => mockViewState,
    setState: vi.fn(),
    subscribe: vi.fn(),
  }),
  SORT_OPTIONS: [
    { value: "position", label: "Manual" },
    { value: "priority", label: "Priority" },
    { value: "due_date", label: "Due date" },
    { value: "created_at", label: "Created date" },
    { value: "title", label: "Title" },
  ],
  GROUPING_OPTIONS: [
    { value: "status", label: "Status" },
    { value: "assignee", label: "Assignee" },
  ],
  CARD_PROPERTY_OPTIONS: [
    { key: "priority", label: "Priority" },
    { key: "description", label: "Description" },
    { key: "assignee", label: "Assignee" },
    { key: "dueDate", label: "Due date" },
    { key: "project", label: "Project" },
    { key: "labels", label: "Labels" },
    { key: "childProgress", label: "Sub-issue progress" },
  ],
}));

vi.mock("@ohmyagentteam/core/issues/stores/view-store-context", () => ({
  ViewStoreProvider: ({ children }: { children: React.ReactNode }) => children,
  useViewStore: (selector?: any) => (selector ? selector(mockViewState) : mockViewState),
  useViewStoreApi: () => ({
    getState: () => mockViewState,
    setState: mockSetViewState,
    subscribe: vi.fn(),
  }),
}));

let mockScope = "all";

vi.mock("@ohmyagentteam/core/issues/stores/issues-scope-store", () => ({
  useIssuesScopeStore: Object.assign(
    (selector?: any) => {
      const state = { scope: mockScope, setScope: vi.fn() };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ scope: mockScope, setScope: vi.fn() }) },
  ),
}));

vi.mock("@ohmyagentteam/core/issues/stores/selection-store", () => ({
  useIssueSelectionStore: Object.assign(
    (selector?: any) => {
      const state = { selectedIds: new Set(), toggle: vi.fn(), clear: vi.fn(), setAll: vi.fn() };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ selectedIds: new Set(), toggle: vi.fn(), clear: vi.fn(), setAll: vi.fn() }) },
  ),
}));

vi.mock("@ohmyagentteam/core/issues/stores/recent-issues-store", () => ({
  useRecentIssuesStore: Object.assign(
    (selector?: any) => {
      const state = { byWorkspace: {}, recordVisit: vi.fn(), pruneWorkspaces: vi.fn() };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        byWorkspace: {},
        recordVisit: vi.fn(),
        pruneWorkspaces: vi.fn(),
      }),
    },
  ),
  selectRecentIssues: () => () => [],
}));

vi.mock("@ohmyagentteam/core/modals", () => ({
  useModalStore: Object.assign(
    () => ({ open: vi.fn() }),
    { getState: () => ({ open: vi.fn() }) },
  ),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

// Mock dnd-kit
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => children,
  DragOverlay: () => null,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  pointerWithin: vi.fn(),
  closestCenter: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: {},
  arrayMove: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

// Mock @base-ui/react/accordion (used by ListView)
vi.mock("@base-ui/react/accordion", () => ({
  Accordion: Object.assign(
    ({ children }: any) => <div>{children}</div>,
    {
      Root: ({ children }: any) => <div>{children}</div>,
      Item: ({ children }: any) => <div>{children}</div>,
      Header: ({ children }: any) => <div>{children}</div>,
      Trigger: ({ children }: any) => <button>{children}</button>,
      Panel: ({ children }: any) => <div>{children}</div>,
    },
  ),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const issueDefaults = {
  parent_issue_id: null,
  project_id: null,
  position: 0,
  stage: null,
  metadata: {},
};

const mockIssues: Issue[] = [
  {
    ...issueDefaults,
    id: "issue-1",
    workspace_id: "ws-1",
    number: 1,
    identifier: "TES-1",
    title: "Implement auth",
    description: "Add JWT authentication",
    status: "todo",
    priority: "high",
    assignee_type: "member",
    assignee_id: "user-1",
    creator_type: "member",
    creator_id: "user-1",
    start_date: null,
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ...issueDefaults,
    id: "issue-2",
    workspace_id: "ws-1",
    number: 2,
    identifier: "TES-2",
    title: "Design landing page",
    description: null,
    status: "in_progress",
    priority: "medium",
    assignee_type: "agent",
    assignee_id: "agent-1",
    creator_type: "member",
    creator_id: "user-1",
    start_date: null,
    due_date: "2026-02-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ...issueDefaults,
    id: "issue-3",
    workspace_id: "ws-1",
    number: 3,
    identifier: "TES-3",
    title: "Write tests",
    description: null,
    status: "backlog",
    priority: "low",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "user-1",
    start_date: null,
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ...issueDefaults,
    id: "issue-4",
    workspace_id: "ws-1",
    number: 4,
    identifier: "TES-4",
    title: "Squad task",
    description: null,
    status: "todo",
    priority: "medium",
    assignee_type: "squad",
    assignee_id: "squad-1",
    creator_type: "member",
    creator_id: "user-1",
    start_date: null,
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function mockAssigneeGroups(issues: Issue[]) {
  const groups = new Map<string, { assignee_type: Issue["assignee_type"]; assignee_id: string | null; issues: Issue[] }>();
  for (const issue of issues) {
    const id =
      issue.assignee_type && issue.assignee_id
        ? `assignee:${issue.assignee_type}:${issue.assignee_id}`
        : "assignee:unassigned";
    if (!groups.has(id)) {
      groups.set(id, {
        assignee_type: issue.assignee_type,
        assignee_id: issue.assignee_id,
        issues: [],
      });
    }
    groups.get(id)!.issues.push(issue);
  }
  return {
    groups: [...groups.entries()].map(([id, group]) => ({
      id,
      assignee_type: group.assignee_type,
      assignee_id: group.assignee_id,
      issues: group.issues,
      total: group.issues.length,
    })),
  };
}

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { IssuesPage } from "./issues-page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={qc}>
        {ui}
      </QueryClientProvider>
    </I18nProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IssuesPage (shared)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListIssues.mockResolvedValue({ issues: [], total: 0 });
    mockListGroupedIssues.mockResolvedValue({ groups: [] });
    mockListProjects.mockResolvedValue({
      projects: [
        {
          id: "project-1",
          workspace_id: "ws-1",
          title: "Website launch",
          description: null,
          icon: null,
          status: "planned",
          priority: "none",
          lead_type: null,
          lead_id: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          issue_count: 3,
          done_count: 1,
          resource_count: 0,
        },
      ],
      total: 1,
    });
    mockQuickCreateIssue.mockResolvedValue({ task_id: "task-1" });
    mockGetQuickCreateIssueStatus.mockResolvedValue({
      task_id: "task-1",
      status: "running",
      mode: "planning",
      default_status: "backlog",
      issues: [],
      issue_count: 0,
      agent_assignment_count: 0,
      member_assignment_count: 0,
      squad_assignment_count: 0,
      all_backlog: false,
      terminal: false,
      error: null,
    });
    mockListInbox.mockResolvedValue([]);
    mockGetIssue.mockResolvedValue({
      ...mockIssues[2],
      id: "issue-created",
      identifier: "TES-10",
      title: "Created issue",
      status: "backlog",
      assignee_type: "agent",
      assignee_id: "agent-1",
    });
    mockViewState.viewMode = "board";
    mockViewState.grouping = "status";
    mockViewState.statusFilters = [];
    mockViewState.priorityFilters = [];
    mockViewState.projectFilters = [];
    mockViewState.includeNoProject = false;
    mockScope = "all";
  });

  it("shows loading skeletons initially", () => {
    renderWithQuery(<IssuesPage />);
    expect(
      screen.getAllByRole("generic").some((el) => el.getAttribute("data-slot") === "skeleton"),
    ).toBe(true);
  });

  it("renders issue titles after data loads", async () => {
    mockListIssues.mockImplementation((params: any) =>
      Promise.resolve({
        issues: mockIssues.filter((i) => i.status === params?.status),
        total: mockIssues.filter((i) => i.status === params?.status).length,
      }),
    );

    renderWithQuery(<IssuesPage />);

    await screen.findByText("Implement auth");
    expect(screen.getByText("Design landing page")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
  });

  it("renders board column headers", async () => {
    mockListIssues.mockImplementation((params: any) =>
      Promise.resolve({
        issues: mockIssues.filter((i) => i.status === params?.status),
        total: mockIssues.filter((i) => i.status === params?.status).length,
      }),
    );

    renderWithQuery(<IssuesPage />);

    await screen.findByText("Backlog");
    expect(screen.getAllByText("Todo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1);
  });

  it("groups board columns by assignee", async () => {
    mockViewState.grouping = "assignee";
    mockListGroupedIssues.mockResolvedValue(mockAssigneeGroups(mockIssues));

    renderWithQuery(<IssuesPage />);

    // "Test User" renders both as the assignee group header and on the
    // assignee chip of each card grouped under that header, so a unique
    // match is not guaranteed.
    await screen.findAllByText("Test User");
    expect(screen.getAllByText("Agent One").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Squad One").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("No assignee")).toBeInTheDocument();
  });

  it("uses grouped assignee endpoint instead of status page sweep", async () => {
    mockViewState.grouping = "assignee";
    mockListGroupedIssues.mockResolvedValue(mockAssigneeGroups(mockIssues));

    renderWithQuery(<IssuesPage />);

    await screen.findByText("Implement auth");
    expect(mockListGroupedIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        group_by: "assignee",
        limit: 50,
        offset: 0,
        statuses: ["backlog", "todo", "in_progress", "in_review", "done", "blocked"],
      }),
    );
    expect(mockListIssues).not.toHaveBeenCalled();
  });

  it("shows the 'All work items' section header without a workspace prefix", async () => {
    mockListIssues.mockImplementation((params: any) =>
      Promise.resolve({
        issues: mockIssues.filter((i) => i.status === params?.status),
        total: mockIssues.filter((i) => i.status === params?.status).length,
      }),
    );

    renderWithQuery(<IssuesPage />);

    await screen.findByText("All work items");
    // The list header is now `icon + title`, matching the other list pages.
    // The workspace/org name is no longer rendered as a breadcrumb prefix.
    expect(screen.queryByText("Test WS")).not.toBeInTheDocument();
  });

  it("combines the page title and project scope into one switcher", async () => {
    const user = userEvent.setup();
    mockListIssues.mockImplementation((params: any) =>
      Promise.resolve({
        issues: mockIssues.filter((i) => i.status === params?.status),
        total: mockIssues.filter((i) => i.status === params?.status).length,
      }),
    );

    renderWithQuery(<IssuesPage />);

    const scopeSwitcher = await screen.findByRole("button", {
      name: "All work items",
    });
    expect(screen.queryByRole("button", { name: "Project" })).not.toBeInTheDocument();
    await screen.findByText("Implement auth");
    expect(screen.getAllByText("Unassigned to project").length).toBeGreaterThan(0);

    await user.click(scopeSwitcher);
    expect(
      await screen.findByRole("menuitemradio", {
        name: "Unassigned to project",
      }),
    ).toBeInTheDocument();
    const projectOption = await screen.findByRole("menuitemradio", {
      name: "Website launch",
    });
    await user.click(projectOption);

    expect(mockSetViewState).toHaveBeenCalledWith({
      projectFilters: ["project-1"],
      includeNoProject: false,
    });
  });

  it("shows the selected project name in the page scope switcher", async () => {
    mockViewState.projectFilters = ["project-1"];

    renderWithQuery(<IssuesPage />);

    expect(
      await screen.findByRole("button", { name: "Website launch" }),
    ).toBeInTheDocument();
  });

  it("shows empty state when there are no issues", async () => {
    mockListIssues.mockResolvedValue({ issues: [], total: 0 });

    renderWithQuery(<IssuesPage />);

    await screen.findByText("No work items yet");
    expect(
      screen.getByText(
        "Create one manually, or add an Agent to plan the work with you.",
      ),
    ).toBeInTheDocument();
  });

  it("shows scope tab buttons", async () => {
    renderWithQuery(<IssuesPage />);

    expect(await screen.findAllByText("All")).not.toHaveLength(0);
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  it("submits planning quick-create requests with the selected agent", async () => {
    const user = userEvent.setup();
    renderWithQuery(<IssuesPage />);

    const input = await screen.findByPlaceholderText(
      "Describe what you want to do, and let an agent assign it to a person or another agent",
    );
    await screen.findByText("Agent One");

    await user.type(input, "Plan SSO rollout");
    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(input).toHaveValue("Assigning task...");
    expect(input.closest("[aria-busy='true']")).not.toBeNull();

    await waitFor(() =>
      expect(mockQuickCreateIssue).toHaveBeenCalledWith({
        agent_id: "agent-1",
        prompt: "Plan SSO rollout",
        mode: "planning",
        default_status: "backlog",
      }),
    );
    expect(input).toBeDisabled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("does not submit planning quick-create while an IME composition is active", async () => {
    const user = userEvent.setup();
    renderWithQuery(<IssuesPage />);

    const input = await screen.findByPlaceholderText(
      "Describe what you want to do, and let an agent assign it to a person or another agent",
    );
    await screen.findByText("Agent One");
    await user.type(input, "规划客户活动");

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229 });

    expect(mockQuickCreateIssue).not.toHaveBeenCalled();
    expect(input).toHaveValue("规划客户活动");
  });

  it("shows backend progress states and clears the prompt after planning quick-create completes", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: { task_id: string }) => void;
    mockQuickCreateIssue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    mockGetQuickCreateIssueStatus.mockResolvedValue({
      task_id: "task-1",
      status: "completed",
      mode: "planning",
      default_status: "backlog",
      issues: [
        {
          ...mockIssues[2],
          id: "issue-agent",
          identifier: "TES-10",
          title: "Agent task",
          status: "backlog",
          assignee_type: "agent",
          assignee_id: "agent-1",
        },
        {
          ...mockIssues[2],
          id: "issue-member",
          identifier: "TES-11",
          title: "Member task",
          status: "backlog",
          assignee_type: "member",
          assignee_id: "user-1",
        },
      ],
      issue_count: 2,
      agent_assignment_count: 1,
      member_assignment_count: 1,
      squad_assignment_count: 0,
      all_backlog: true,
      terminal: true,
      error: null,
    });

    renderWithQuery(<IssuesPage />);

    const input = await screen.findByPlaceholderText(
      "Describe what you want to do, and let an agent assign it to a person or another agent",
    );
    await screen.findByText("Agent One");

    await user.type(input, "Plan SSO rollout");
    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(input).toHaveValue("Assigning task...");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: /Create/i })).toBeDisabled();
    expect(input.closest("[aria-busy='true']")).not.toBeNull();

    resolveCreate({ task_id: "task-1" });

    await waitFor(
      () =>
        expect(input).toHaveValue(
          "TES-10 assigned to Agent One",
        ),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(input).toHaveValue("TES-11 assigned to Test User"),
      { timeout: 4000 },
    );
    await waitFor(
      () =>
        expect(input).toHaveValue(
          "All assignments are complete and in Backlog",
        ),
      { timeout: 3000 },
    );
    await waitFor(() => expect(input).toHaveValue(""), { timeout: 5000 });
    expect(input).not.toBeDisabled();
    expect(input.closest("[aria-busy='true']")).toBeNull();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  }, 10_000);

  it("shows each assignment when planning quick-create only assigns agents", async () => {
    const user = userEvent.setup();
    mockGetQuickCreateIssueStatus.mockResolvedValue({
      task_id: "task-1",
      status: "completed",
      mode: "planning",
      default_status: "backlog",
      issues: [
        {
          ...mockIssues[2],
          id: "issue-agent-1",
          identifier: "TES-12",
          title: "Agent task 1",
          status: "backlog",
          assignee_type: "agent",
          assignee_id: "agent-1",
        },
        {
          ...mockIssues[2],
          id: "issue-agent-2",
          identifier: "TES-13",
          title: "Agent task 2",
          status: "backlog",
          assignee_type: "agent",
          assignee_id: "agent-2",
        },
        {
          ...mockIssues[2],
          id: "issue-agent-3",
          identifier: "TES-14",
          title: "Agent task 3",
          status: "backlog",
          assignee_type: "agent",
          assignee_id: "agent-3",
        },
      ],
      issue_count: 3,
      agent_assignment_count: 3,
      member_assignment_count: 0,
      squad_assignment_count: 0,
      all_backlog: true,
      terminal: true,
      error: null,
    });

    renderWithQuery(<IssuesPage />);

    const input = await screen.findByPlaceholderText(
      "Describe what you want to do, and let an agent assign it to a person or another agent",
    );
    await screen.findByText("Agent One");

    await user.type(input, "Plan AI teaching site");
    await user.click(screen.getByRole("button", { name: /Create/i }));

    await waitFor(
      () =>
        expect(input).toHaveValue(
          "TES-12 assigned to Agent One",
        ),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(input).toHaveValue("TES-13 assigned to an agent"),
      { timeout: 4000 },
    );
    await waitFor(
      () => expect(input).toHaveValue("TES-14 assigned to an agent"),
      { timeout: 5000 },
    );
    await waitFor(
      () =>
        expect(input).toHaveValue(
          "All assignments are complete and in Backlog",
        ),
      { timeout: 3000 },
    );
    await waitFor(() => expect(input).toHaveValue(""), { timeout: 7000 });
  }, 10_000);

  // The Members/Agents tabs filter server-side via assignee_types (the same
  // param the grouped endpoint takes), so the mock mirrors the server's
  // WHERE clause instead of a client-side post-filter.
  function mockListIssuesHonoringAssigneeTypes() {
    mockListIssues.mockImplementation((params: any) => {
      const matches = mockIssues.filter(
        (i) =>
          i.status === params?.status &&
          (!params?.assignee_types ||
            (i.assignee_type !== null &&
              params.assignee_types.includes(i.assignee_type))),
      );
      return Promise.resolve({ issues: matches, total: matches.length });
    });
  }

  it("agents scope includes squad-assigned issues", async () => {
    mockScope = "agents";
    mockViewState.viewMode = "list";
    mockListIssuesHonoringAssigneeTypes();
    renderWithQuery(<IssuesPage />);

    // Squad task and agent task should be visible
    await screen.findByText("Design landing page");
    expect(screen.getByText("Squad task")).toBeInTheDocument();
    // Member task should NOT be visible
    expect(screen.queryByText("Implement auth")).not.toBeInTheDocument();
    expect(mockListIssues).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_types: ["agent", "squad"] }),
    );
  });

  it("members scope excludes squad-assigned issues", async () => {
    mockScope = "members";
    mockViewState.viewMode = "list";
    mockListIssuesHonoringAssigneeTypes();
    renderWithQuery(<IssuesPage />);

    await screen.findByText("Implement auth");
    expect(screen.queryByText("Squad task")).not.toBeInTheDocument();
    expect(screen.queryByText("Design landing page")).not.toBeInTheDocument();
    expect(mockListIssues).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_types: ["member"] }),
    );
  });
});
