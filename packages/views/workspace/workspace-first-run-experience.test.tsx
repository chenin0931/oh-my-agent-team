import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_TOUR_VERSION,
  useProductTourStore,
} from "@ohmyagentteam/core/workspace/product-tour-store";
import {
  productTourStorageKey,
  WorkspaceFirstRunExperience,
} from "./workspace-first-run-experience";

const authState = vi.hoisted(() => ({ userId: "user-1" as string | null }));

vi.mock("@ohmyagentteam/core/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: authState.userId ? { id: authState.userId } : null }),
}));

vi.mock("./product-tour", () => ({
  ProductTour: ({
    open,
    onComplete,
  }: {
    open: boolean;
    onComplete: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onComplete}>
        Complete product tour
      </button>
    ) : null,
}));

describe("WorkspaceFirstRunExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    authState.userId = "user-1";
    useProductTourStore.getState().reset();
  });

  it("shows the tour and persists completion without seeding another flow", async () => {
    const user = userEvent.setup();
    render(<WorkspaceFirstRunExperience />);

    const complete = await screen.findByRole("button", {
      name: "Complete product tour",
    });
    await user.click(complete);

    expect(
      window.localStorage.getItem(productTourStorageKey("user-1")),
    ).toBe("1");
    expect(
      screen.queryByRole("button", { name: "Complete product tour" }),
    ).not.toBeInTheDocument();
  });

  it("does not repeat a completed version automatically", async () => {
    window.localStorage.setItem(productTourStorageKey("user-1"), "1");

    render(<WorkspaceFirstRunExperience />);

    expect(
      screen.queryByRole("button", { name: "Complete product tour" }),
    ).not.toBeInTheDocument();
  });

  it("can be reopened manually from Help after completion", async () => {
    window.localStorage.setItem(productTourStorageKey("user-1"), "1");
    render(<WorkspaceFirstRunExperience />);

    act(() => useProductTourStore.getState().open());

    expect(
      await screen.findByRole("button", { name: "Complete product tour" }),
    ).toBeInTheDocument();
  });

  it("uses a versioned per-user completion key", () => {
    expect(productTourStorageKey("user-7")).toContain("user-7");
    expect(productTourStorageKey("user-7")).toContain(
      `v${PRODUCT_TOUR_VERSION}`,
    );
  });
});
