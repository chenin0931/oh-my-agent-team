import { describe, expect, it } from "vitest";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionStatus,
} from "@ohmyagentteam/core/types";
import {
  canInterruptManagedSession,
  filterManagedSessionEventsForDisplay,
} from "./managed-session-section";

const threads = [
  { id: "executor-thread", role: "executor" },
  { id: "reviewer-thread", role: "reviewer" },
] as AgentSession["threads"];

function event(
  id: string,
  eventType: string,
  payload: Record<string, unknown>,
  threadId?: string,
): AgentSessionEvent {
  return {
    id,
    seq: Number(id),
    agent_session_id: "session-1",
    thread_id: threadId,
    actor_type: "agent",
    event_type: eventType,
    payload,
    created_at: "2026-07-18T00:00:00Z",
  };
}

describe("filterManagedSessionEventsForDisplay", () => {
  it("keeps user-facing progress and sanitized outcome events", () => {
    const events = [
      event("1", "agent.message", { message: "Working" }, "executor-thread"),
      event(
        "2",
        "outcome.evaluation_completed",
        { verdict: "passed", summary: "Accepted" },
        "reviewer-thread",
      ),
    ];

    expect(filterManagedSessionEventsForDisplay(events, threads)).toEqual(events);
  });

  it("hides duplicate turn summaries and reviewer protocol messages", () => {
    const events = [
      event("1", "agent.message", { summary: "Working" }, "executor-thread"),
      event(
        "2",
        "agent.message",
        { message: '{"verdict":"passed"}' },
        "reviewer-thread",
      ),
      event("3", "session.status_completed", { status: "completed" }),
    ];

    expect(
      filterManagedSessionEventsForDisplay(events, threads).map((item) =>
        item.id,
      ),
    ).toEqual(["3"]);
  });
});

describe("canInterruptManagedSession", () => {
  it.each<AgentSessionStatus>([
    "queued",
    "running",
    "waiting_approval",
    "waiting_environment",
  ])("allows interrupting an active %s session", (status) => {
    expect(canInterruptManagedSession(status)).toBe(true);
  });

  it.each<AgentSessionStatus>([
    "waiting_input",
    "idle",
    "completed",
    "failed",
    "cancelled",
  ])("does not offer an interrupt for a %s session", (status) => {
    expect(canInterruptManagedSession(status)).toBe(false);
  });
});
