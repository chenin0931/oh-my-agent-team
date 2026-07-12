"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { api, ApiError } from "@ohmyagentteam/core/api";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import { inboxKeys } from "@ohmyagentteam/core/inbox/queries";
import { issueKeys } from "@ohmyagentteam/core/issues/queries";
import { epicKeys } from "@ohmyagentteam/core/epics/queries";
import {
  agentListOptions,
  memberListOptions,
} from "@ohmyagentteam/core/workspace/queries";
import {
  checkPlanningQuickCreateCliVersion,
  readRuntimeCliVersion,
  runtimeListOptions,
} from "@ohmyagentteam/core/runtimes";
import { useQuickCreateStore } from "@ohmyagentteam/core/issues/stores/quick-create-store";
import { isImeComposing } from "@ohmyagentteam/core/utils";
import type { Agent, Issue } from "@ohmyagentteam/core/types";
import { ActorAvatar } from "../../common/actor-avatar";
import { useT } from "../../i18n";
import { matchesPinyin } from "../../editor/extensions/pinyin-match";
import { canAssignAgent } from "./pickers/assignee-picker";
import {
  PickerEmpty,
  PickerItem,
  PickerSection,
  PropertyPicker,
} from "./pickers/property-picker";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_FAILURES = 20;
const PROGRESS_STEP_MS = 1200;
const COMPLETION_HOLD_MS = 2400;

export function PlanningQuickCreateBar() {
  const { t } = useT("issues");
  const queryClient = useQueryClient();
  const wsId = useWorkspaceId();
  const workspacePaths = useWorkspacePaths();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const lastActorType = useQuickCreateStore((s) => s.lastActorType);
  const lastActorId = useQuickCreateStore((s) => s.lastActorId);
  const setLastActor = useQuickCreateStore((s) => s.setLastActor);

  const memberRole = useMemo(
    () => members.find((m) => m.user_id === userId)?.role,
    [members, userId],
  );
  const visibleAgents = useMemo(
    () =>
      agents.filter(
        (a) => !a.archived_at && canAssignAgent(a, userId, memberRole),
      ),
    [agents, userId, memberRole],
  );

  const [agentId, setAgentId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressTaskId, setProgressTaskId] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agentId && visibleAgents.some((a) => a.id === agentId)) return;
    if (
      lastActorType === "agent" &&
      lastActorId &&
      visibleAgents.some((a) => a.id === lastActorId)
    ) {
      setAgentId(lastActorId);
      return;
    }
    setAgentId(visibleAgents[0]?.id ?? null);
  }, [agentId, lastActorId, lastActorType, visibleAgents]);

  const selectedAgent = useMemo(
    () => visibleAgents.find((a) => a.id === agentId),
    [agentId, visibleAgents],
  );
  const selectedRuntime = useMemo(
    () =>
      selectedAgent?.runtime_id
        ? runtimes.find((r) => r.id === selectedAgent.runtime_id)
        : undefined,
    [runtimes, selectedAgent?.runtime_id],
  );
  const versionCheck = useMemo(
    () =>
      checkPlanningQuickCreateCliVersion(
        readRuntimeCliVersion(selectedRuntime?.metadata),
      ),
    [selectedRuntime?.metadata],
  );
  const versionBlocked = !!selectedAgent && versionCheck.state !== "ok";
  const progressActive = submitting || !!progressTaskId || !!progressMessage;
  const displayValue =
    progressActive && progressMessage
      ? progressMessage
      : progressActive
        ? t(($) => $.planning_quick_create.creating)
        : prompt;
  const canSubmit =
    !!selectedAgent &&
    prompt.trim().length > 0 &&
    !progressActive &&
    !versionBlocked;

  const assignmentName = useCallback(
    (issue: Issue) => {
      if (issue.assignee_type === "agent" && issue.assignee_id) {
        return (
          agents.find((agent) => agent.id === issue.assignee_id)?.name ??
          t(($) => $.planning_quick_create.agent_fallback)
        );
      }
      if (issue.assignee_type === "member" && issue.assignee_id) {
        return (
          members.find((member) => member.user_id === issue.assignee_id)?.name ??
          t(($) => $.planning_quick_create.member_fallback)
        );
      }
      return issue.assignee_type
        ? t(($) => $.planning_quick_create.assignee_fallback)
        : null;
    },
    [agents, members, t],
  );

  const submit = useCallback(async () => {
    const body = prompt.trim();
    if (!selectedAgent || !body || progressActive || versionBlocked) return;
    setSubmitting(true);
    setProgressMessage(t(($) => $.planning_quick_create.creating));
    setError(null);
    try {
      const result = await api.quickCreateIssue({
        agent_id: selectedAgent.id,
        prompt: body,
        mode: "planning",
        default_status: "backlog",
      });
      setLastActor("agent", selectedAgent.id);
      if (!result.task_id) {
        throw new Error(t(($) => $.planning_quick_create.error_unknown));
      }
      setProgressTaskId(result.task_id);
    } catch (e) {
      setProgressMessage(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object") {
        const body = e.body as {
          reason?: string;
          message?: string;
          error?: string;
        };
        setError(
          body.reason ||
            body.message ||
            body.error ||
            t(($) => $.planning_quick_create.error_unknown),
        );
      } else {
        setError(
          e instanceof Error && e.message
            ? e.message
            : t(($) => $.planning_quick_create.error_unknown),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [progressActive, prompt, selectedAgent, setLastActor, t, versionBlocked]);

  useEffect(() => {
    if (!progressTaskId) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const announcedIssueIds = new Set<string>();
    const announcedEpicIds = new Set<string>();
    let backlogConfirmAttempts = 0;
    let consecutivePollFailures = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, ms);
      });

    const finish = () => {
      setPrompt("");
      setProgressTaskId(null);
      setProgressMessage(null);
      queryClient.invalidateQueries({ queryKey: issueKeys.all(wsId) });
      queryClient.invalidateQueries({ queryKey: epicKeys.all(wsId) });
      queryClient.invalidateQueries({ queryKey: inboxKeys.list(wsId) });
    };

    const fail = (message: string) => {
      setError(message);
      setProgressTaskId(null);
      setProgressMessage(null);
    };

    const poll = async () => {
      try {
        const status = await api.getQuickCreateIssueStatus(progressTaskId);
        if (cancelled) return;
        consecutivePollFailures = 0;

        const createdItems = status.created_items ?? status.issues ?? [];
        const newEpics = (status.epics ?? []).filter((epic) => !announcedEpicIds.has(epic.id));
        for (const epic of newEpics) {
          announcedEpicIds.add(epic.id);
          setProgressMessage(
            t(($) => $.planning_quick_create.progress_created_epic, {
              identifier: epic.identifier,
            }),
          );
          await wait(PROGRESS_STEP_MS);
          if (cancelled) return;
        }

        const newIssues = status.issues.filter(
          (issue) => !announcedIssueIds.has(issue.id),
        );
        for (const issue of newIssues) {
          announcedIssueIds.add(issue.id);
          const assignee = assignmentName(issue);
          setProgressMessage(
            assignee
              ? t(($) => $.planning_quick_create.progress_assigned_item, {
                  identifier: issue.identifier,
                  assignee,
                })
              : t(($) => $.planning_quick_create.progress_created_item, {
                  identifier: issue.identifier,
                }),
          );
          await wait(PROGRESS_STEP_MS);
          if (cancelled) return;
        }

        if (cancelled) return;
        if (status.terminal && status.status !== "completed") {
          fail(status.error || t(($) => $.planning_quick_create.error_unknown));
          return;
        }

        if (createdItems.length > 0 && !status.all_backlog) {
          backlogConfirmAttempts += 1;
          setProgressMessage(
            t(($) => $.planning_quick_create.progress_confirming_backlog),
          );
          if (status.terminal && backlogConfirmAttempts > 6) {
            fail(t(($) => $.planning_quick_create.progress_backlog_timeout));
            return;
          }
        }

        if (
          status.terminal &&
          status.status === "completed" &&
          createdItems.length === 0
        ) {
          fail(t(($) => $.planning_quick_create.error_unknown));
          return;
        }

        if (cancelled) return;
        if (
          status.terminal &&
          status.status === "completed" &&
          createdItems.length > 0 &&
          status.all_backlog
        ) {
          setProgressMessage(
            t(($) => $.planning_quick_create.progress_all_done),
          );
          await wait(COMPLETION_HOLD_MS);
          if (!cancelled) finish();
          return;
        }

        timeout = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= MAX_POLL_FAILURES) {
          fail(t(($) => $.planning_quick_create.progress_connection_failed));
          return;
        }
        timeout = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [assignmentName, progressTaskId, queryClient, t, wsId]);

  return (
    <div className="shrink-0 px-4 pt-3 pb-2">
      <div
        aria-busy={progressActive}
        aria-live="polite"
        className={cn(
          "relative grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 overflow-hidden rounded-md border px-2 py-1.5 shadow-sm transition-all duration-200 sm:flex",
          progressActive
            ? "border-primary/35 bg-primary/5 ring-2 ring-primary/15"
            : "bg-background",
        )}
      >
        {progressActive && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-nav-progress-sweep bg-gradient-to-r from-transparent via-primary to-transparent"
          />
        )}
        <Sparkles
          className={cn(
            "ml-1 size-4 shrink-0 text-muted-foreground",
            progressActive && "animate-pulse text-primary",
          )}
        />
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:flex-none">
          <PlanningAgentPicker
            agents={visibleAgents}
            selectedAgent={selectedAgent}
            disabled={progressActive}
            onPick={(agent) => {
              setAgentId(agent.id);
              setError(null);
            }}
          />
        </div>
        <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />
        <input
          value={displayValue}
          disabled={progressActive}
          onChange={(e) => {
            setPrompt(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (isImeComposing(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t(($) => $.planning_quick_create.placeholder)}
          className="col-span-2 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:text-muted-foreground sm:col-span-1"
        />
        <Button
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          disabled={!canSubmit}
          onClick={submit}
        >
          <SendHorizontal className="size-3.5" />
          {t(($) => $.planning_quick_create.submit)}
        </Button>
      </div>
      {(error || versionBlocked) && (
        <div className="mt-1 px-2 text-xs text-destructive">
          {error ||
            (versionCheck.state === "missing"
              ? t(($) => $.planning_quick_create.version_missing, {
                  min: versionCheck.min,
                })
              : t(($) => $.planning_quick_create.version_below, {
                  current: versionCheck.current,
                  min: versionCheck.min,
                }))}
        </div>
      )}
      {visibleAgents.length === 0 && !error && (
        <p className="mt-1.5 px-2 text-xs text-muted-foreground">
          {t(($) => $.planning_quick_create.no_agents_help)}{" "}
          <a
            href={workspacePaths.agents()}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t(($) => $.planning_quick_create.no_agents_action)}
          </a>
        </p>
      )}
    </div>
  );
}

function PlanningAgentPicker({
  agents,
  selectedAgent,
  disabled,
  onPick,
}: {
  agents: Agent[];
  selectedAgent: Agent | undefined;
  disabled: boolean;
  onPick: (agent: Agent) => void;
}) {
  const { t } = useT("issues");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const filteredAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(query) ||
          matchesPinyin(agent.name, query),
      ),
    [agents, query],
  );

  return (
    <PropertyPicker
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setFilter("");
      }}
      width="w-64"
      align="start"
      searchable
      searchPlaceholder={t(($) => $.planning_quick_create.search_placeholder)}
      onSearchChange={setFilter}
      trigger={
        <span
          className={`flex min-w-32 max-w-52 items-center gap-1.5 text-sm ${
            disabled ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {selectedAgent ? (
            <>
              <ActorAvatar
                actorType="agent"
                actorId={selectedAgent.id}
                size={18}
              />
              <span className="truncate">{selectedAgent.name}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">
              {t(($) => $.planning_quick_create.pick_agent)}
            </span>
          )}
        </span>
      }
    >
      {filteredAgents.length > 0 ? (
        <PickerSection label={t(($) => $.planning_quick_create.agents_group)}>
          {filteredAgents.map((agent) => (
            <PickerItem
              key={agent.id}
              selected={selectedAgent?.id === agent.id}
              onClick={() => {
                onPick(agent);
                setOpen(false);
              }}
            >
              <ActorAvatar
                actorType="agent"
                actorId={agent.id}
                size={18}
                showStatusDot
              />
              <span className="truncate">{agent.name}</span>
            </PickerItem>
          ))}
        </PickerSection>
      ) : query ? (
        <PickerEmpty />
      ) : (
        <div className="px-2 py-2 text-sm text-muted-foreground">
          {t(($) => $.planning_quick_create.no_agents)}
        </div>
      )}
    </PropertyPicker>
  );
}
