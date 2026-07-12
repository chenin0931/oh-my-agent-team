import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@ohmyagentteam/core/i18n/react";
import { configStore } from "@ohmyagentteam/core/config";
import enCommon from "../../locales/en/common.json";
import enRuntimes from "../../locales/en/runtimes.json";
import {
  ConnectDesktopAgentDialog,
  desktopAgentConnectCommand,
} from "./connect-remote-dialog";

const TEST_RESOURCES = { en: { common: enCommon, runtimes: enRuntimes } };

vi.mock("@ohmyagentteam/core/hooks", () => ({
  useWorkspaceId: () => "ws-test",
}));

vi.mock("@ohmyagentteam/core/paths", () => ({
  paths: {
    workspace: () => ({
      agents: () => "/agents",
      runtimeDetail: () => "/runtimes/rt-test",
    }),
  },
  useWorkspaceSlug: () => "workspace-test",
}));

vi.mock("@ohmyagentteam/core/realtime", () => ({
  useWSEvent: vi.fn(),
}));

vi.mock("../../navigation", () => ({
  useNavigation: () => ({ push: vi.fn() }),
}));

function resetConfigStore() {
  configStore.setState({
    cdnDomain: "",
    allowSignup: true,
    googleClientId: "",
    daemonServerUrl: "",
    daemonAppUrl: "",
    workspaceCreationDisabled: false,
  });
}

function renderDialog(config?: {
  daemonServerUrl?: string;
  daemonAppUrl?: string;
}) {
  resetConfigStore();
  if (config) {
    configStore.getState().setDaemonConfig(config);
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <ConnectDesktopAgentDialog initialProvider="codex" onClose={vi.fn()} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const ligatureClasses = [
  "[font-variant-ligatures:none]",
  "[font-feature-settings:'liga'_0]",
];

describe("ConnectDesktopAgentDialog", () => {
  it("uses one cloud connection command by default", () => {
    const { baseElement } = renderDialog();

    expect(baseElement).toHaveTextContent(
      "scripts/install.sh | bash -s -- --connect",
    );
    expect(baseElement).toHaveTextContent(
      "Once connected, you can create team agents powered by Codex on this computer.",
    );
    expect(baseElement).not.toHaveTextContent("--connect --server-url");
    expect(baseElement).toHaveTextContent(
      "omat config set server_url https://api.ohmyagentteam.com",
    );
    expect(baseElement).toHaveTextContent(
      "omat config set app_url https://ohmyagentteam.com",
    );
  });

  it("adds self-host URLs to the one-click connection command", () => {
    const { baseElement } = renderDialog({
      daemonServerUrl: "https://api.example.com/",
      daemonAppUrl: "https://app.example.com/",
    });

    expect(baseElement).toHaveTextContent(
      "--connect --server-url https://api.example.com --app-url https://app.example.com",
    );
    expect(baseElement).toHaveTextContent(
      "omat config set server_url https://api.example.com",
    );
    expect(baseElement).toHaveTextContent(
      "omat config set app_url https://app.example.com",
    );
  });

  it("disables font ligatures in connection command code", () => {
    const { baseElement } = renderDialog();

    const setupCode = Array.from(baseElement.querySelectorAll("code")).find((node) =>
      node.textContent?.includes("--connect"),
    );

    expect(setupCode).toHaveClass(...ligatureClasses);
  });

  it("disables font ligatures in fallback token command code", () => {
    const { baseElement } = renderDialog();

    const tokenCode = Array.from(baseElement.querySelectorAll("code")).find((node) =>
      node.textContent?.includes("omat login --token <YOUR_TOKEN>"),
    );

    expect(tokenCode).toHaveClass(...ligatureClasses);
  });

  it("builds normalized self-host commands", () => {
    expect(
      desktopAgentConnectCommand(
        "https://api.example.com/",
        "https://app.example.com/",
      ),
    ).toContain(
      "--connect --server-url https://api.example.com --app-url https://app.example.com",
    );
  });
});
