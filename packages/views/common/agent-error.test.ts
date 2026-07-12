import { describe, expect, it } from "vitest";
import { formatAgentError } from "./agent-error";

describe("formatAgentError", () => {
  it("extracts a nested provider message from JSON", () => {
    expect(
      formatAgentError(
        JSON.stringify({
          type: "error",
          status: 400,
          error: { type: "invalid_request_error", message: "Upgrade the CLI." },
        }),
      ),
    ).toBe("Upgrade the CLI.");
  });

  it("keeps plain text and malformed JSON readable", () => {
    expect(formatAgentError("  Runtime unavailable\ntry again  ")).toBe(
      "Runtime unavailable try again",
    );
    expect(formatAgentError("{not-json}")).toBe("{not-json}");
  });
});
