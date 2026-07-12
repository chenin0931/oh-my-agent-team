import { describe, it, expect, vi } from "vitest";
import { clearWorkspaceStorage } from "./storage-cleanup";

describe("clearWorkspaceStorage", () => {
  it("removes all workspace-scoped keys for given wsId", () => {
    const adapter = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    clearWorkspaceStorage(adapter, "ws_123");

    expect(adapter.removeItem).toHaveBeenCalledWith("omat_issue_draft:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("omat_issue_surface_views:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("omat_issues_view:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("omat_issues_scope:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("omat_my_issues_view:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("ohmyagentteam:chat:selectedAgentId:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("ohmyagentteam:chat:activeSessionId:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("ohmyagentteam:chat:drafts:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("ohmyagentteam:chat:expanded:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledWith("omat_navigation:ws_123");
    expect(adapter.removeItem).toHaveBeenCalledTimes(10);
  });
});
