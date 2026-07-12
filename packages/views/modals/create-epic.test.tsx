import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@ohmyagentteam/core/i18n/react";
import enProjects from "../locales/en/projects.json";
import { CreateEpicModal } from "./create-epic";

const {
  mockCreateEpic,
  mockPush,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockCreateEpic: vi.fn(),
  mockPush: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    switch (options.queryKey[0]) {
      case "project-fixtures":
        return { data: [{ id: "project-1", title: "Launch project" }] };
      case "member-fixtures":
        return { data: [{ user_id: "member-1", name: "Taylor" }] };
      case "agent-fixtures":
        return {
          data: [
            { id: "agent-1", name: "Planning Agent", archived_at: null },
            { id: "agent-archived", name: "Archived Agent", archived_at: "2026-01-01" },
          ],
        };
      default:
        return { data: [] };
    }
  },
}));

vi.mock("@ohmyagentteam/core/projects/queries", () => ({
  projectListOptions: () => ({ queryKey: ["project-fixtures"] }),
}));

vi.mock("@ohmyagentteam/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["member-fixtures"] }),
  agentListOptions: () => ({ queryKey: ["agent-fixtures"] }),
}));

vi.mock("@ohmyagentteam/core/epics/mutations", () => ({
  useCreateEpic: () => ({ mutateAsync: mockCreateEpic, isPending: false }),
}));

vi.mock("@ohmyagentteam/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@ohmyagentteam/core/paths", () => ({
  useWorkspacePaths: () => ({ epicDetail: (id: string) => `/acme/epics/${id}` }),
}));
vi.mock("../navigation", () => ({ useNavigation: () => ({ push: mockPush }) }));
vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={{ en: { projects: enProjects } }}>
      {children}
    </I18nProvider>
  );
}

describe("CreateEpicModal", () => {
  beforeEach(() => {
    mockCreateEpic.mockReset().mockResolvedValue({ id: "epic-1" });
    mockPush.mockReset();
    mockToastSuccess.mockReset();
  });

  it("creates a planning-only Epic through the dedicated API", async () => {
    const onClose = vi.fn();
    render(
      <CreateEpicModal onClose={onClose} data={{ project_id: "project-1" }} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("heading", { name: "Create epic" })).toBeInTheDocument();
    expect(screen.queryByText("Squad One")).not.toBeInTheDocument();
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
    expect(screen.queryByText("Switch to Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Agent")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Epic"), {
      target: { value: "Launch self-serve onboarding" },
    });
    fireEvent.change(screen.getByLabelText("Goal and scope"), {
      target: { value: "Reduce time to first value." },
    });
    fireEvent.change(screen.getByLabelText("Success criteria"), {
      target: { value: "Customers activate within one day." },
    });

    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveValue("project-1");
    fireEvent.change(selects[1]!, { target: { value: "agent:agent-1" } });
    fireEvent.change(selects[2]!, { target: { value: "high" } });
    fireEvent.change(selects[3]!, { target: { value: "on_track" } });
    fireEvent.click(screen.getByRole("button", { name: "New epic" }));

    await waitFor(() => {
      expect(mockCreateEpic).toHaveBeenCalledWith({
        title: "Launch self-serve onboarding",
        project_id: "project-1",
        description: "Reduce time to first value.",
        success_criteria: "Customers activate within one day.",
        health: "on_track",
        priority: "high",
        owner_type: "agent",
        owner_id: "agent-1",
        start_date: null,
        target_date: null,
      });
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/acme/epics/epic-1");
    expect(mockToastSuccess).toHaveBeenCalledOnce();
  });
});
