import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../test/i18n";
import { ProductTour } from "./product-tour";

describe("ProductTour", () => {
  it("moves through the six product concepts and completes", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    renderWithI18n(<ProductTour open onComplete={onComplete} />);

    expect(
      screen.getByRole("heading", {
        name: "Bring people and agents into one team",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", {
        name: "Projects define outcomes; work items carry execution",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to slide 6" }));
    expect(
      screen.getByRole("heading", {
        name: "Connect tools and build your agent team",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Start collaborating/i }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("supports skipping the tour", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    renderWithI18n(<ProductTour open onComplete={onComplete} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onComplete).toHaveBeenCalledOnce();
  });
});
