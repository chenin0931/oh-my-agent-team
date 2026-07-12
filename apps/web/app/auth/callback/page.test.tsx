import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { paths } from "@ohmyagentteam/core/paths";

const {
  mockPush,
  mockSearchParams,
  mockLoginWithGoogle,
  mockListWorkspaces,
  mockListMyInvitations,
  mockSetQueryData,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearchParams: new URLSearchParams(),
  mockLoginWithGoogle: vi.fn(),
  mockListWorkspaces: vi.fn(),
  mockListMyInvitations: vi.fn(),
  mockSetQueryData: vi.fn(),
}));

const makeUser = () => ({
  id: "user-1",
  name: "Test",
  email: "test@ohmyagentteam.com",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

// Preserve the real sanitizeNextUrl so the "drop unsafe ?next=" behavior is
// exercised rather than silently diverging from the source of truth.
vi.mock("@ohmyagentteam/core/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@ohmyagentteam/core/auth")>(
      "@ohmyagentteam/core/auth",
    );
  return {
    ...actual,
    useAuthStore: (selector: (s: unknown) => unknown) =>
      selector({ loginWithGoogle: mockLoginWithGoogle }),
  };
});

vi.mock("@ohmyagentteam/core/workspace/queries", () => ({
  workspaceKeys: {
    list: () => ["workspaces"],
    myInvitations: () => ["invitations", "mine"],
  },
}));

vi.mock("@ohmyagentteam/core/api", () => ({
  api: {
    listWorkspaces: mockListWorkspaces,
    listMyInvitations: mockListMyInvitations,
    googleLogin: vi.fn(),
  },
}));

import CallbackPage from "./page";

describe("CallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Snapshot keys before deleting — forEach + delete skips entries because
    // the iteration index advances while the underlying list shrinks.
    Array.from(mockSearchParams.keys()).forEach((k) =>
      mockSearchParams.delete(k),
    );
    mockSearchParams.set("code", "test-code");
    mockLoginWithGoogle.mockResolvedValue(makeUser());
    mockListWorkspaces.mockResolvedValue([]);
    mockListMyInvitations.mockResolvedValue([]);
  });

  it("honors a safe next= target", async () => {
    mockSearchParams.set("state", "next:/invite/abc123");
    render(<CallbackPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/invite/abc123");
    });
    // nextUrl is a fast path — listMyInvitations should not be queried.
    expect(mockListMyInvitations).not.toHaveBeenCalled();
  });

  it("user with no workspace or pending invitation lands on workspace creation", async () => {
    render(<CallbackPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(paths.newWorkspace());
    });
    expect(mockListMyInvitations).toHaveBeenCalled();
  });

  it("user with no workspace and pending invitations lands on /invitations", async () => {
    mockListMyInvitations.mockResolvedValue([
      {
        id: "inv-1",
        workspace_id: "ws-1",
        workspace_name: "Acme",
        role: "member",
        status: "pending",
      },
    ]);
    render(<CallbackPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(paths.invitations());
    });
  });

  it("user with a workspace lands in that workspace", async () => {
    mockListWorkspaces.mockResolvedValue([
      {
        id: "ws-1",
        name: "Acme",
        slug: "acme",
        description: null,
        context: null,
        settings: {},
        repos: [],
        issue_prefix: "ACME",
        avatar_url: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    render(<CallbackPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(paths.workspace("acme").issues());
    });
    // Existing workspace members see later invites in the sidebar.
    expect(mockListMyInvitations).not.toHaveBeenCalled();
  });

  it("ignores unsafe next= targets and lands on the default destination", async () => {
    mockSearchParams.set("state", "next:https://evil.example");

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalledWith("https://evil.example");
  });

  it("honors a safe invitation next= target", async () => {
    mockSearchParams.set("state", "next:/invite/abc123");

    render(<CallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/invite/abc123");
    });
  });

  it("falls through to workspace creation when invitation lookup errors", async () => {
    mockListMyInvitations.mockRejectedValue(new Error("network"));
    render(<CallbackPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(paths.newWorkspace());
    });
  });

  it("redirects to CLI callback with token when state contains valid cli_callback", async () => {
    const { api: mockedApi } = await import("@ohmyagentteam/core/api");
    const mockGoogleLogin = mockedApi.googleLogin as ReturnType<typeof vi.fn>;

    const hrefSetter = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, set href(value: string) { hrefSetter(value); } },
    });

    try {
      mockSearchParams.set(
        "state",
        "cli_callback:http://127.0.0.1:46233/callback,cli_state:abc123",
      );
      mockGoogleLogin.mockResolvedValue({ token: "cli-jwt-token" });

      render(<CallbackPage />);

      await waitFor(() => {
        expect(mockGoogleLogin).toHaveBeenCalledWith(
          "test-code",
          expect.stringContaining("/auth/callback"),
        );
      });

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(
          "http://127.0.0.1:46233/callback?token=cli-jwt-token&state=abc123",
        );
      });
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("falls through to normal web flow when state contains invalid cli_callback", async () => {
    mockSearchParams.set("state", "cli_callback:https://evil.com/callback");
    mockLoginWithGoogle.mockResolvedValue(makeUser());
    mockListWorkspaces.mockResolvedValue([]);
    mockListMyInvitations.mockResolvedValue([]);

    render(<CallbackPage />);

    await waitFor(() => {
      // Normal web flow: loginWithGoogle is called (not googleLogin)
      expect(mockLoginWithGoogle).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(paths.newWorkspace());
    });
  });

  it("redirects to CLI callback even when state also contains platform:desktop", async () => {
    // cli_callback takes precedence over platform:desktop — the CLI flow
    // is a specific user intent that should not be derailed by desktop flag.
    const { api: mockedApi } = await import("@ohmyagentteam/core/api");
    const mockGoogleLogin = mockedApi.googleLogin as ReturnType<typeof vi.fn>;

    const hrefSetter = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, set href(value: string) { hrefSetter(value); } },
    });

    try {
      mockSearchParams.set(
        "state",
        "platform:desktop,cli_callback:http://localhost:12345/callback,cli_state:mystate",
      );
      mockGoogleLogin.mockResolvedValue({ token: "mixed-jwt" });

      render(<CallbackPage />);

      await waitFor(() => {
        expect(mockGoogleLogin).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(
          "http://localhost:12345/callback?token=mixed-jwt&state=mystate",
        );
      });
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

});
