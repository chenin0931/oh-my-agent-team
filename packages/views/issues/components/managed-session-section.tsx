"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleX,
  Clock3,
  Loader2,
  MessageSquare,
  Monitor,
  MonitorOff,
  Pause,
  Play,
  Plus,
  Send,
  ShieldAlert,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@ohmyagentteam/core/api";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import {
  agentSessionEventsOptions,
  agentSessionKeys,
  agentSessionOptions,
  issueAgentSessionsOptions,
} from "@ohmyagentteam/core/issues";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionStatus,
  Issue,
  PostAgentSessionEventRequest,
  SessionApproval,
} from "@ohmyagentteam/core/types";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { Textarea } from "@ohmyagentteam/ui/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ohmyagentteam/ui/components/ui/tooltip";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { ActorAvatar } from "../../common/actor-avatar";
import { useT, useTimeAgo } from "../../i18n";
import { ExecutionLogSection } from "./execution-log-section";

const CLOSED_SESSION_STATUSES = new Set<AgentSessionStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const INTERRUPTIBLE_SESSION_STATUSES = new Set<AgentSessionStatus>([
  "queued",
  "running",
  "waiting_approval",
  "waiting_environment",
]);

export function ManagedSessionSection({ issue }: { issue: Issue }) {
  const issueId = issue.id;
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useT("issues");
  const timeAgo = useTimeAgo();
  const [selectedId, setSelectedId] = useState("");
  const [eventsOpen, setEventsOpen] = useState(true);
  const [message, setMessage] = useState("");

  const sessionsQuery = useQuery({
    ...issueAgentSessionsOptions(workspaceId, issueId),
    enabled: workspaceId.length > 0 && issueId.length > 0,
  });
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const currentSession = useMemo(
    () => sessions.find((session) => !CLOSED_SESSION_STATUSES.has(session.status)) ?? sessions[0],
    [sessions],
  );
  const sessionId = selectedId || currentSession?.id || "";
  const detailQuery = useQuery({
    ...agentSessionOptions(workspaceId, sessionId),
    enabled: workspaceId.length > 0 && sessionId.length > 0,
  });
  const eventsQuery = useQuery({
    ...agentSessionEventsOptions(workspaceId, sessionId),
    enabled: workspaceId.length > 0 && sessionId.length > 0,
  });
  const session = detailQuery.data ?? sessions.find((item) => item.id === sessionId);
  const canStartFirstSession =
    (issue.assignee_type === "agent" || issue.assignee_type === "squad") &&
    Boolean(issue.assignee_id) &&
    !["backlog", "done", "cancelled"].includes(issue.status);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: agentSessionKeys.issue(workspaceId, issueId) }),
      sessionId
        ? queryClient.invalidateQueries({ queryKey: agentSessionKeys.detail(workspaceId, sessionId) })
        : Promise.resolve(),
      sessionId
        ? queryClient.invalidateQueries({ queryKey: agentSessionKeys.events(workspaceId, sessionId) })
        : Promise.resolve(),
    ]);
  };

  const eventMutation = useMutation({
    mutationFn: (event: PostAgentSessionEventRequest) => api.postAgentSessionEvent(sessionId, event),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message || t(($) => $.managed_session.action_failed)),
  });
  const newSessionMutation = useMutation({
    mutationFn: () => api.createIssueAgentSession(issueId),
    onSuccess: async () => {
      setSelectedId("");
      await refresh();
      toast.success(t(($) => $.managed_session.new_session_started));
    },
    onError: (error: Error) => toast.error(error.message || t(($) => $.managed_session.action_failed)),
  });

  if (sessionsQuery.isLoading) {
    return (
      <div className="mt-5 border-y border-border/70 py-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-12 animate-pulse rounded-md bg-muted/70" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <section
          className="mt-5 overflow-hidden rounded-md border border-border/80 bg-background"
          aria-label={t(($) => $.managed_session.section)}
        >
          <div className="flex min-w-0 items-start gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{t(($) => $.managed_session.section)}</h3>
                <span className="text-xs text-muted-foreground">{t(($) => $.managed_session.not_started)}</span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {canStartFirstSession
                  ? t(($) => $.managed_session.ready_body)
                  : t(($) => $.managed_session.empty_body)}
              </p>
              {canStartFirstSession && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => newSessionMutation.mutate()}
                  disabled={newSessionMutation.isPending}
                >
                  {newSessionMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                  {t(($) => $.managed_session.start_session)}
                </Button>
              )}
            </div>
          </div>
        </section>
        <ExecutionLogSection issueId={issueId} />
      </>
    );
  }

  const events = eventsQuery.data?.events ?? [];
  const displayEvents = filterManagedSessionEventsForDisplay(
    events,
    session.threads,
  );
  const visibleEvents = displayEvents.slice(-20);
  const pendingApprovals = (session.approvals ?? []).filter((approval) => approval.status === "pending");
  const canInterrupt = canInterruptManagedSession(session.status);
  const canSend = !CLOSED_SESSION_STATUSES.has(session.status) && message.trim().length > 0;
  const canStartNewSession = session.mode === "executor" || session.mode === "coordinator";

  const submitMessage = () => {
    const content = message.trim();
    if (!content) return;
    eventMutation.mutate(
      { type: "user.message", message: content },
      { onSuccess: () => setMessage("") },
    );
  };

  return (
    <section className="mt-5 overflow-hidden rounded-md border border-border/80 bg-background @container" aria-label={t(($) => $.managed_session.section)}>
      <header className="relative flex min-w-0 flex-col gap-3 px-4 py-3 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className={cn("flex min-w-0 items-start gap-2.5", sessions.length === 1 && canStartNewSession && "pr-8 @lg:pr-0")}>
          <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", statusTone(session.status))}>
            <SessionStatusIcon status={session.status} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">{t(($) => $.managed_session.section)}</h3>
              <span className="text-xs font-medium text-muted-foreground">{sessionStatusLabel(session.status, t)}</span>
              <span className="text-xs text-muted-foreground/70">{sessionModeLabel(session.mode, t)}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{session.goal}</p>
          </div>
        </div>
        <div className={cn(
          "flex min-w-0 w-full items-center gap-1 @lg:w-auto @lg:shrink-0",
          sessions.length === 1 && canStartNewSession && "absolute right-3 top-3 w-auto",
        )}>
          {sessions.length > 1 && (
            <select
              value={sessionId}
              onChange={(event) => setSelectedId(event.target.value)}
              aria-label={t(($) => $.managed_session.select_session)}
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring @lg:max-w-40 @lg:flex-none"
            >
              {sessions.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index === 0 ? t(($) => $.managed_session.current) : timeAgo(item.created_at)} · {sessionStatusLabel(item.status, t)}
                </option>
              ))}
            </select>
          )}
          {canStartNewSession && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => newSessionMutation.mutate()}
                    disabled={newSessionMutation.isPending}
                    aria-label={t(($) => $.managed_session.new_session)}
                  >
                    {newSessionMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                  </Button>
                }
              />
              <TooltipContent>{t(($) => $.managed_session.new_session)}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="grid gap-2 border-t border-border/70 px-4 py-3 @lg:grid-cols-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted-foreground">{t(($) => $.managed_session.participants)}</div>
          <div className="mt-1.5 flex min-w-0 flex-wrap gap-2">
            {session.threads.map((thread) => (
              <div key={thread.id} className="flex min-w-0 items-center gap-1.5 text-xs">
                <ActorAvatar actorType="agent" actorId={thread.agent_id} size={20} enableHoverCard />
                <span className="max-w-36 truncate font-medium">{thread.agent_name || t(($) => $.managed_session.agent_fallback)}</span>
                <span className="text-muted-foreground">{threadRoleLabel(thread.role, t)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted-foreground">{t(($) => $.managed_session.environment)}</div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
            {session.status === "waiting_environment" ? (
              <MonitorOff className="size-3.5 shrink-0 text-warning" />
            ) : (
              <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">
              {session.threads[0]?.runtime_name || t(($) => $.managed_session.no_environment)}
            </span>
            {session.threads[0]?.runtime_provider && (
              <span className="shrink-0 text-muted-foreground">· {session.threads[0].runtime_provider}</span>
            )}
          </div>
        </div>
      </div>

      {session.status === "waiting_environment" && (
        <div className="flex items-start gap-2 border-t border-warning/20 bg-warning/5 px-4 py-3 text-xs">
          <MonitorOff className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">{t(($) => $.managed_session.environment_waiting_title)}</div>
            <div className="mt-0.5 text-muted-foreground">{t(($) => $.managed_session.environment_waiting_body)}</div>
          </div>
        </div>
      )}

      {pendingApprovals.map((approval) => (
        <ApprovalRow
          key={approval.id}
          approval={approval}
          pending={eventMutation.isPending}
          onDecision={(decision) =>
            eventMutation.mutate({
              type: "user.approval_decision",
              approval_id: approval.id,
              decision,
            })
          }
        />
      ))}

      {session.outcome && (
        <div className="border-t border-border/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <CheckCircle2 className={cn("size-4", session.outcome.status === "passed" ? "text-success" : "text-muted-foreground")} />
              {t(($) => $.managed_session.outcome)}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {t(($) => $.managed_session.iteration, {
                current: session.outcome.current_iteration,
                max: session.outcome.max_iterations,
              })}
            </span>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t(($) => $.managed_session.acceptance_criteria)}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-foreground/80">{session.outcome.rubric_markdown}</p>
          </details>
          {session.outcome.evaluations.at(-1)?.summary && (
            <p className="mt-2 text-xs text-muted-foreground">{session.outcome.evaluations.at(-1)?.summary}</p>
          )}
        </div>
      )}

      <div className="border-t border-border/70">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium hover:bg-muted/40"
          onClick={() => setEventsOpen((open) => !open)}
        >
          {eventsOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          {t(($) => $.managed_session.events)}
          <span className="text-muted-foreground">{displayEvents.length}</span>
        </button>
        {eventsOpen && (
          <div className="max-h-80 overflow-y-auto border-t border-border/50 px-4 py-2">
            {eventsQuery.isLoading ? (
              <div className="py-3 text-xs text-muted-foreground">{t(($) => $.managed_session.loading_events)}</div>
            ) : visibleEvents.length === 0 ? (
              <div className="py-3 text-xs text-muted-foreground">{t(($) => $.managed_session.no_events)}</div>
            ) : (
              <div className="divide-y divide-border/50">
                {visibleEvents.map((event) => (
                  <SessionEventRow key={event.id} event={event} timeAgo={timeAgo} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!CLOSED_SESSION_STATUSES.has(session.status) && (
        <div className="flex items-end gap-2 border-t border-border/70 bg-muted/15 p-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend && !eventMutation.isPending) submitMessage();
              }
            }}
            placeholder={t(($) => $.managed_session.message_placeholder)}
            className="min-h-10 max-h-28 resize-none rounded-md bg-background text-sm"
            disabled={eventMutation.isPending}
          />
          {canInterrupt && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => eventMutation.mutate({ type: "user.interrupt" })}
                    disabled={eventMutation.isPending}
                    aria-label={t(($) => $.managed_session.interrupt)}
                  >
                    <Square className="size-3.5 fill-current" />
                  </Button>
                }
              />
              <TooltipContent>{t(($) => $.managed_session.interrupt)}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  onClick={submitMessage}
                  disabled={!canSend || eventMutation.isPending}
                  aria-label={t(($) => $.managed_session.send)}
                >
                  {eventMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              }
            />
            <TooltipContent>{t(($) => $.managed_session.send)}</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className="border-t border-border/70 px-4 py-2">
        <ExecutionLogSection issueId={issueId} legacyOnly />
      </div>
    </section>
  );
}

function ApprovalRow({
  approval,
  pending,
  onDecision,
}: {
  approval: SessionApproval;
  pending: boolean;
  onDecision: (decision: "approve" | "reject") => void;
}) {
  const { t } = useT("issues");
  return (
    <div className="flex flex-col gap-3 border-t border-warning/25 bg-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{approval.title}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{approval.action_namespace}</div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 self-end sm:self-auto">
        <Button size="sm" variant="ghost" onClick={() => onDecision("reject")} disabled={pending}>
          <X data-icon="inline-start" />
          {t(($) => $.managed_session.reject)}
        </Button>
        <Button size="sm" onClick={() => onDecision("approve")} disabled={pending}>
          <Check data-icon="inline-start" />
          {t(($) => $.managed_session.approve)}
        </Button>
      </div>
    </div>
  );
}

function SessionEventRow({ event, timeAgo }: { event: AgentSessionEvent; timeAgo: (date: string) => string }) {
  const { t } = useT("issues");
  const content = eventContent(event, t);
  return (
    <div className="flex gap-2 py-2.5 text-xs">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <EventIcon eventType={event.event_type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{eventLabel(event.event_type, t)}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(event.created_at)}</span>
        </div>
        {content && <div className="mt-0.5 line-clamp-5 whitespace-pre-wrap break-words text-muted-foreground">{content}</div>}
      </div>
    </div>
  );
}

function SessionStatusIcon({ status }: { status: AgentSessionStatus }) {
  switch (status) {
    case "running": return <Loader2 className="size-4 animate-spin" />;
    case "queued": return <Clock3 className="size-4" />;
    case "waiting_approval": return <ShieldAlert className="size-4" />;
    case "waiting_input": return <MessageSquare className="size-4" />;
    case "waiting_environment": return <MonitorOff className="size-4" />;
    case "idle": return <Pause className="size-4" />;
    case "completed": return <CheckCircle2 className="size-4" />;
    case "failed": return <CircleX className="size-4" />;
    case "cancelled": return <Ban className="size-4" />;
    default: return <Play className="size-4" />;
  }
}

function EventIcon({ eventType }: { eventType: string }) {
  if (eventType.startsWith("agent.tool_")) return <Wrench className="size-3.5" />;
  if (eventType === "agent.message") return <Bot className="size-3.5" />;
  if (eventType.startsWith("approval.")) return <ShieldAlert className="size-3.5" />;
  if (eventType.startsWith("user.")) return <MessageSquare className="size-3.5" />;
  if (eventType.includes("completed")) return <CheckCircle2 className="size-3.5" />;
  return <Clock3 className="size-3.5" />;
}

function statusTone(status: AgentSessionStatus) {
  switch (status) {
    case "running": return "bg-info/10 text-info";
    case "waiting_approval": return "bg-warning/10 text-warning";
    case "waiting_environment":
    case "waiting_input": return "bg-warning/10 text-warning";
    case "completed": return "bg-success/10 text-success";
    case "failed": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

type IssueT = ReturnType<typeof useT<"issues">>["t"];

function sessionStatusLabel(status: AgentSessionStatus, t: IssueT) {
  switch (status) {
    case "queued": return t(($) => $.managed_session.status.queued);
    case "running": return t(($) => $.managed_session.status.running);
    case "waiting_approval": return t(($) => $.managed_session.status.waiting_approval);
    case "waiting_input": return t(($) => $.managed_session.status.waiting_input);
    case "waiting_environment": return t(($) => $.managed_session.status.waiting_environment);
    case "idle": return t(($) => $.managed_session.status.idle);
    case "completed": return t(($) => $.managed_session.status.completed);
    case "failed": return t(($) => $.managed_session.status.failed);
    case "cancelled": return t(($) => $.managed_session.status.cancelled);
  }
}

function sessionModeLabel(mode: AgentSession["mode"], t: IssueT) {
  switch (mode) {
    case "executor": return t(($) => $.managed_session.mode.executor);
    case "advisor": return t(($) => $.managed_session.mode.advisor);
    case "coordinator": return t(($) => $.managed_session.mode.coordinator);
    case "reviewer": return t(($) => $.managed_session.mode.reviewer);
    case "planning": return t(($) => $.managed_session.mode.planning);
  }
}

function threadRoleLabel(role: AgentSession["threads"][number]["role"], t: IssueT) {
  switch (role) {
    case "executor": return t(($) => $.managed_session.role.executor);
    case "advisor": return t(($) => $.managed_session.role.advisor);
    case "coordinator": return t(($) => $.managed_session.role.coordinator);
    case "reviewer": return t(($) => $.managed_session.role.reviewer);
    case "planner": return t(($) => $.managed_session.role.planner);
  }
}

function eventLabel(eventType: string, t: IssueT) {
  if (eventType === "agent.message") return t(($) => $.managed_session.event.agent_message);
  if (eventType === "agent.tool_started") return t(($) => $.managed_session.event.tool_started);
  if (eventType === "agent.tool_completed") return t(($) => $.managed_session.event.tool_completed);
  if (eventType === "agent.tool_failed") return t(($) => $.managed_session.event.tool_failed);
  if (eventType === "approval.requested") return t(($) => $.managed_session.event.approval_requested);
  if (eventType === "approval.approved") return t(($) => $.managed_session.event.approval_approved);
  if (eventType === "approval.rejected") return t(($) => $.managed_session.event.approval_rejected);
  if (eventType === "user.message") return t(($) => $.managed_session.event.user_message);
  if (eventType === "user.interrupt") return t(($) => $.managed_session.event.user_interrupt);
  if (eventType.startsWith("session.status_")) return t(($) => $.managed_session.event.status_changed);
  if (eventType === "session.thread_created") return t(($) => $.managed_session.event.thread_created);
  if (eventType === "session.thread_failed") return t(($) => $.managed_session.event.thread_failed);
  if (eventType === "session.delegation_completed") return t(($) => $.managed_session.event.delegation_completed);
  if (eventType === "session.thread_turn_queued") return t(($) => $.managed_session.event.turn_queued);
  if (eventType === "outcome.evaluation_started") return t(($) => $.managed_session.event.outcome_started);
  if (eventType === "outcome.evaluation_completed") return t(($) => $.managed_session.event.outcome_completed);
  return t(($) => $.managed_session.event.system);
}

export function filterManagedSessionEventsForDisplay(
  events: AgentSessionEvent[],
  threads: AgentSession["threads"],
): AgentSessionEvent[] {
  const reviewerThreadIds = new Set(
    threads
      .filter((thread) => thread.role === "reviewer")
      .map((thread) => thread.id),
  );

  return events.filter((event) => {
    if (event.event_type !== "agent.message") return true;

    // Turn summaries duplicate the already streamed Agent messages. Reviewer
    // messages are structured provider protocol; users get the sanitized
    // verdict from outcome.evaluation_completed instead.
    if (typeof event.payload.summary === "string") return false;
    return !event.thread_id || !reviewerThreadIds.has(event.thread_id);
  });
}

export function canInterruptManagedSession(status: AgentSessionStatus): boolean {
  return INTERRUPTIBLE_SESSION_STATUSES.has(status);
}

function eventContent(event: AgentSessionEvent, t: IssueT): string {
  const payload = event.payload;
  if (event.event_type.startsWith("session.status_") && typeof payload.status === "string" && payload.status) {
    const statuses: AgentSessionStatus[] = [
      "queued", "running", "waiting_approval", "waiting_input", "waiting_environment",
      "idle", "completed", "failed", "cancelled",
    ];
    const status = statuses.find((candidate) => candidate === payload.status);
    return `${t(($) => $.managed_session.event.status_prefix)} ${status ? sessionStatusLabel(status, t) : payload.status}`;
  }
  for (const key of ["message", "summary", "reason", "title"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  if (event.event_type === "session.delegation_completed") {
    const completed = typeof payload.completed === "number" ? payload.completed : 0;
    const failed = typeof payload.failed === "number" ? payload.failed : 0;
    return t(($) => $.managed_session.event.delegation_summary, { completed, failed });
  }
  if (typeof payload.tool === "string" && payload.tool) return payload.tool;
  if (typeof payload.status === "string" && payload.status) {
    const statuses: AgentSessionStatus[] = [
      "queued", "running", "waiting_approval", "waiting_input", "waiting_environment",
      "idle", "completed", "failed", "cancelled",
    ];
    const status = statuses.find((candidate) => candidate === payload.status);
    return `${t(($) => $.managed_session.event.status_prefix)} ${status ? sessionStatusLabel(status, t) : payload.status}`;
  }
  return "";
}
