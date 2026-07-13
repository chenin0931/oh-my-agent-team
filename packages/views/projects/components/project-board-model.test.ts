import { describe, expect, it } from "vitest";
import { isProjectBoardItem } from "./project-board-model";

describe("isProjectBoardItem", () => {
  it("keeps backlog work items visible on the project board", () => {
    expect(isProjectBoardItem({ issue_type: "issue" })).toBe(true);
    expect(isProjectBoardItem({ issue_type: "subtask" })).toBe(true);
  });

  it("keeps planning containers out of the project board", () => {
    expect(isProjectBoardItem({ issue_type: "epic" })).toBe(false);
  });
});
