import { describe, expect, it } from "vitest";
import { workspaceUrlHost } from "./workspace-url";

describe("workspaceUrlHost", () => {
  it("returns the host of a full app URL", () => {
    expect(workspaceUrlHost("https://ohmyagentteam.example.com")).toBe(
      "ohmyagentteam.example.com",
    );
  });

  it("ignores scheme, path, and trailing slash", () => {
    expect(workspaceUrlHost("https://ohmyagentteam.example.com/")).toBe(
      "ohmyagentteam.example.com",
    );
    expect(workspaceUrlHost("http://ohmyagentteam.example.com/app/workspaces/new")).toBe(
      "ohmyagentteam.example.com",
    );
  });

  it("preserves a non-default port", () => {
    expect(workspaceUrlHost("https://my.host:3000")).toBe("my.host:3000");
  });

  it("accepts a bare host without a scheme", () => {
    expect(workspaceUrlHost("ohmyagentteam.example.com")).toBe("ohmyagentteam.example.com");
    expect(workspaceUrlHost("ohmyagentteam.example.com/path")).toBe(
      "ohmyagentteam.example.com",
    );
  });

  it("falls back to the brand host when no app URL is configured", () => {
    expect(workspaceUrlHost("")).toBe("ohmyagentteam.com");
    expect(workspaceUrlHost("   ")).toBe("ohmyagentteam.com");
    expect(workspaceUrlHost(null)).toBe("ohmyagentteam.com");
    expect(workspaceUrlHost(undefined)).toBe("ohmyagentteam.com");
  });
});
