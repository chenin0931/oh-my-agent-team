// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@ohmyagentteam/core/i18n/react";
import enAgents from "../../locales/en/agents.json";
import { ModelDropdown } from "./model-dropdown";

vi.mock("@ohmyagentteam/core/runtimes", () => ({
  runtimeModelsOptions: (runtimeId: string | null) => ({
    queryKey: ["runtime-models", runtimeId],
    queryFn: async () => ({
      supported: true,
      models: [
        { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", default: true },
        { id: "gpt-5.4", label: "GPT-5.4", provider: "openai" },
      ],
    }),
  }),
}));

function renderDropdown(preferDiscoveredDefault: boolean, onChange: (value: string) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nProvider locale="en" resources={{ en: { agents: enAgents } }}>
      <QueryClientProvider client={client}>
        <ModelDropdown
          runtimeId="runtime-1"
          runtimeOnline
          value=""
          onChange={onChange}
          preferDiscoveredDefault={preferDiscoveredDefault}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe("ModelDropdown discovered defaults", () => {
  it("pins a Codex agent to the default reported by its runtime", async () => {
    const onChange = vi.fn();
    renderDropdown(true, onChange);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("gpt-5.5"));
  });

  it("keeps provider-managed defaults for other runtimes", async () => {
    const onChange = vi.fn();
    renderDropdown(false, onChange);

    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });
});
