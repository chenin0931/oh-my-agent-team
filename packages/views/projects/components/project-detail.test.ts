import { describe, expect, it } from "vitest";
import { projectTabPrefersWideCanvas } from "./project-detail";

describe("projectTabPrefersWideCanvas", () => {
  it.each(["board", "roadmap"])("prioritizes the canvas for %s", (tab) => {
    expect(projectTabPrefersWideCanvas(tab)).toBe(true);
  });

  it.each([null, "backlog", "overview", "activity"])(
    "keeps project properties available for %s",
    (tab) => {
      expect(projectTabPrefersWideCanvas(tab)).toBe(false);
    },
  );
});
