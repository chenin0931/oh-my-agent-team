export type DesktopAgentProvider = "codex" | "claude" | "codebuddy";

export interface DesktopAgentCatalogItem {
  provider: DesktopAgentProvider;
  name: string;
  installCommand: string;
  launchCommand: string;
}

export const DESKTOP_AGENT_CATALOG: DesktopAgentCatalogItem[] = [
  {
    provider: "codex",
    name: "Codex",
    installCommand: "npm install -g @openai/codex",
    launchCommand: "codex",
  },
  {
    provider: "claude",
    name: "Claude Code",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    launchCommand: "claude",
  },
  {
    provider: "codebuddy",
    name: "WorkBuddy",
    installCommand: "npm install -g @tencent-ai/codebuddy-code",
    launchCommand: "codebuddy",
  },
];

export function desktopAgentCatalogItem(
  provider: DesktopAgentProvider | null | undefined,
): DesktopAgentCatalogItem | null {
  return (
    DESKTOP_AGENT_CATALOG.find((item) => item.provider === provider) ?? null
  );
}
