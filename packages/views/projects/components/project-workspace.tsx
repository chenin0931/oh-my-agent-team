"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Columns3, GanttChart, LayoutDashboard, ListTodo, Plus } from "lucide-react";
import type { Epic, Issue, Project, ProjectActivityItem } from "@ohmyagentteam/core/types";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { IssueSurface, type IssueSurfaceRenderContext } from "../../issues/surface/issue-surface";
import { PlanningQuickCreateBar } from "../../issues/components/planning-quick-create-bar";
import { StatusIcon } from "../../issues/components/status-icon";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { useActorName } from "@ohmyagentteam/core/workspace/hooks";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { projectActivityOptions } from "@ohmyagentteam/core/projects/queries";
import { epicListOptions } from "@ohmyagentteam/core/epics/queries";
import { useModalStore } from "@ohmyagentteam/core/modals";
import { buildProjectBacklogModel } from "./project-backlog-model";
import { isProjectBoardItem } from "./project-board-model";
import { deduplicateProjectActivity } from "./project-activity-model";
import { formatAgentError } from "../../common/agent-error";
import { useT } from "../../i18n";

type WorkspaceTab = "overview" | "backlog" | "board" | "roadmap" | "activity";

const tabs: { id: WorkspaceTab; icon: typeof LayoutDashboard }[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "backlog", icon: ListTodo },
  { id: "board", icon: Columns3 },
  { id: "roadmap", icon: GanttChart },
  { id: "activity", icon: Activity },
];

export function ProjectWorkspace({ project }: { project: Project }) {
  const { t } = useT("projects");
  const [tab, setTab] = useState<WorkspaceTab>("backlog");
  const scope = useMemo(() => ({ type: "project" as const, projectId: project.id }), [project.id]);
  const wsId = useWorkspaceId();
  const { data: epics = [] } = useQuery(epicListOptions(wsId, project.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-4"
      >
        {tabs.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs text-muted-foreground",
              tab === id && "border-foreground text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {t(($) => $.workspace.tabs[id])}
          </button>
        ))}
      </div>

      {tab === "overview" && <ProjectOverview project={project} epics={epics} />}
      {tab === "backlog" && (
        <IssueSurface
          scope={scope}
          modes={["list"]}
          surfaceKey={`project:${project.id}:backlog`}
          renderHeader={() => (
            <div className="shrink-0 px-5 pt-4">
              <div className="mx-auto max-w-5xl">
                <PlanningQuickCreateBar projectId={project.id} />
              </div>
            </div>
          )}
          renderEmpty={(context) => <ProjectBacklog project={project} epics={epics} context={context} />}
          renderContent={(context) => <ProjectBacklog project={project} epics={epics} context={context} />}
          contentClassName="overflow-y-auto"
        />
      )}
      {tab === "board" && (
        <IssueSurface
          scope={scope}
          modes={["board"]}
          surfaceKey={`project:${project.id}:board`}
          clientFilter={isProjectBoardItem}
        />
      )}
      {tab === "roadmap" && (
        <ProjectRoadmap epics={epics} />
      )}
      {tab === "activity" && (
        <ProjectActivity project={project} />
      )}
    </div>
  );
}

function ProjectOverview({ project, epics }: { project: Project; epics: Epic[] }) {
  const { t } = useT("projects");
  const paths = useWorkspacePaths();
  const total = project.issue_count;
  const completed = project.done_count;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <section>
          <h2 className="text-sm font-semibold">{t(($) => $.workspace.overview.progress)}</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{completed}/{total} · {percent}%</span>
          </div>
        </section>
        <section>
          <h2 className="text-sm font-semibold">{t(($) => $.workspace.roadmap.title)}</h2>
          <div className="mt-3 divide-y border-y">
            {epics.map((epic) => (
              <AppLink key={epic.id} href={paths.epicDetail(epic.id)} className="flex items-center gap-4 py-3 text-sm hover:bg-accent/40">
                <span className="min-w-0 flex-1 truncate font-medium">{epic.title}</span>
                <div className="hidden w-40 items-center gap-2 sm:flex">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-emerald-500" style={{ width: `${epic.completion_percent}%` }} />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {t(($) => $.workspace.roadmap.done, { done: epic.done_issues, total: epic.total_issues })}
                </span>
              </AppLink>
            ))}
            {epics.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t(($) => $.workspace.roadmap.empty)}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProjectBacklog({ project, epics: allEpics, context }: { project: Project; epics: Epic[]; context: IssueSurfaceRenderContext }) {
  const { t } = useT("projects");
  const openModal = useModalStore((state) => state.open);
  const { issues, controller } = context;
  const backlog = useMemo(() => buildProjectBacklogModel(issues, allEpics), [issues, allEpics]);
  const {
    epics,
    visibleIssues,
    issueCount,
    subtasks,
    subtasksByParent,
    byEpic,
    ungrouped,
    orphanedSubtasks,
  } = backlog;
  const showUngroupedSection =
    ungrouped.length > 0 ||
    orphanedSubtasks.length > 0 ||
    (epics.length === 0 && visibleIssues.length === 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t(($) => $.workspace.backlog.title)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(($) => $.workspace.backlog.description)}</p>
            <p className="text-xs text-muted-foreground">
              {t(($) => $.workspace.backlog.summary, { epics: epics.length, issues: issueCount, subtasks: subtasks.length })}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" size="sm" variant="outline" onClick={() => openModal("create-epic", { project_id: project.id })}>
              <Plus className="size-3.5" /> {t(($) => $.workspace.backlog.epic)}
            </Button>
            <Button className="flex-1 sm:flex-none" size="sm" onClick={() => controller.openCreateIssue({ issue_type: "issue", status: "backlog", project_id: project.id })}>
              <Plus className="size-3.5" /> {t(($) => $.workspace.backlog.issue)}
            </Button>
          </div>
        </div>

        {epics.map((epic) => (
          <section key={epic.id} className="border-t pt-3">
            <EpicBacklogRow epic={epic} />
            <div className="ml-6 mt-1 space-y-1 border-l pl-3">
              {(byEpic.get(epic.id) ?? []).map((issue) => (
                <div key={issue.id}>
                  <BacklogRow issue={issue} onAddSubtask={() => controller.openCreateIssue({ issue_type: "subtask", status: "backlog", parent_issue_id: issue.id, project_id: project.id })} />
                  {(subtasksByParent.get(issue.id) ?? []).map((subtask) => <div key={subtask.id} className="ml-7"><BacklogRow issue={subtask} /></div>)}
                </div>
              ))}
              <button type="button" className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => controller.openCreateIssue({ issue_type: "issue", status: "backlog", epic_id: epic.id, project_id: project.id })}>
                <Plus className="mr-1 inline size-3" /> {t(($) => $.workspace.backlog.add_issue)}
              </button>
            </div>
          </section>
        ))}

        {showUngroupedSection && (
          <section className="border-t pt-3">
            {(ungrouped.length > 0 || orphanedSubtasks.length > 0) && (
              <div className="mb-2">
                <h3 className="text-xs font-medium text-foreground">
                  {t(($) => $.workspace.backlog.ungrouped)}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(($) => $.workspace.backlog.ungrouped_description)}
                </p>
              </div>
            )}
            {ungrouped.map((issue) => (
              <div key={issue.id}>
                <BacklogRow issue={issue} onAddSubtask={() => controller.openCreateIssue({ issue_type: "subtask", status: "backlog", parent_issue_id: issue.id, project_id: project.id })} />
                {(subtasksByParent.get(issue.id) ?? []).map((subtask) => <div key={subtask.id} className="ml-7"><BacklogRow issue={subtask} /></div>)}
              </div>
            ))}
            {orphanedSubtasks.map((subtask) => <BacklogRow key={subtask.id} issue={subtask} />)}
            {epics.length === 0 && visibleIssues.length === 0 && orphanedSubtasks.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t(($) => $.workspace.backlog.empty)}</p>}
          </section>
        )}
      </div>
    </div>
  );
}

function BacklogRow({ issue, strong, onAddSubtask }: { issue: Issue; strong?: boolean; onAddSubtask?: () => void }) {
  const { t } = useT("projects");
  const paths = useWorkspacePaths();
  const { getActorName } = useActorName();
  return (
    <div className="group flex min-h-9 items-center gap-2 rounded px-2 hover:bg-accent/50">
      <StatusIcon status={issue.status} className="size-3.5" />
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground/70">{issue.identifier}</span>
      <AppLink href={paths.issueDetail(issue.id)} className={cn("min-w-0 flex-1 truncate text-sm", strong && "font-semibold")}>{issue.title}</AppLink>
      {issue.assignee_type && issue.assignee_id && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ActorAvatar actorType={issue.assignee_type} actorId={issue.assignee_id} size={18} />
          <span className="hidden max-w-28 truncate lg:inline">{getActorName(issue.assignee_type, issue.assignee_id)}</span>
        </span>
      )}
      {onAddSubtask && <button type="button" title={t(($) => $.workspace.backlog.add_subtask)} aria-label={t(($) => $.workspace.backlog.add_subtask)} onClick={onAddSubtask} className="rounded p-1 text-muted-foreground hover:bg-accent md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"><Plus className="size-3.5" /></button>}
    </div>
  );
}

function EpicBacklogRow({ epic }: { epic: Epic }) {
  const { t } = useT("projects");
  const paths = useWorkspacePaths();
  const { getActorName } = useActorName();
  return (
    <div className="flex min-h-10 items-center gap-3 px-2">
      <AppLink href={paths.epicDetail(epic.id)} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">{epic.title}</AppLink>
      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
        {t(($) => $.epic.statuses[epic.lifecycle])}
        {epic.health ? ` · ${t(($) => $.epic.healths[epic.health!])}` : ""}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{epic.completion_percent}%</span>
      {epic.owner_type && epic.owner_id && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ActorAvatar actorType={epic.owner_type} actorId={epic.owner_id} size={18} />
          <span className="hidden max-w-28 truncate lg:inline">{getActorName(epic.owner_type, epic.owner_id)}</span>
        </span>
      )}
    </div>
  );
}

function ProjectActivity({ project }: { project: Project }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const { data, isLoading } = useQuery(projectActivityOptions(wsId, project.id));
  const paths = useWorkspacePaths();
  const { getActorName } = useActorName();
  const items = deduplicateProjectActivity(data?.items ?? []);
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-sm font-semibold">{t(($) => $.workspace.activity.title)}</h2>
        <div className="divide-y">
          {items.map((item) => (
            <AppLink key={`${item.kind}:${item.id}`} href={item.target_type === "epic" ? paths.epicDetail(item.target_id) : paths.issueDetail(item.target_id || item.issue_id)} className="flex items-start gap-3 py-3 text-sm hover:bg-accent/40">
              {item.actor_type && item.actor_type !== "system" && item.actor_id ? (
                <ActorAvatar actorType={item.actor_type} actorId={item.actor_id} size={22} />
              ) : (
                <Activity className="mt-0.5 size-4 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.issue_identifier}</span>
                  <span className="truncate">{item.issue_title}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {item.actor_type && item.actor_type !== "system" && item.actor_id ? `${getActorName(item.actor_type, item.actor_id)} · ` : ""}
                  {formatProjectActivity(item, t)}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</time>
            </AppLink>
          ))}
          {!isLoading && items.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t(($) => $.workspace.activity.empty)}</p>}
        </div>
      </div>
    </div>
  );
}

const PROJECT_ACTIVITY_ACTIONS = {
  created: "created",
  status_changed: "status_changed",
  priority_changed: "priority_changed",
  assignee_changed: "assignee_changed",
  start_date_changed: "start_date_changed",
  due_date_changed: "due_date_changed",
  title_changed: "title_changed",
  description_updated: "description_updated",
  squad_leader_evaluated: "squad_leader_evaluated",
  comment_created: "comment_created",
  task_queued: "task_queued",
  task_dispatched: "task_dispatched",
  task_running: "task_running",
  task_waiting_local_directory: "task_waiting_local_directory",
  task_deferred: "task_deferred",
  task_completed: "task_completed",
  task_failed: "task_failed",
  task_cancelled: "task_cancelled",
} as const;

function formatProjectActivity(
  item: ProjectActivityItem,
  t: ReturnType<typeof useT<"projects">>["t"],
) {
  if (item.body) {
    return item.kind === "run" ? formatAgentError(item.body) : item.body;
  }
  const key = PROJECT_ACTIVITY_ACTIONS[
    item.action as keyof typeof PROJECT_ACTIVITY_ACTIONS
  ];
  return key
    ? t(($) => $.workspace.activity.actions[key])
    : t(($) => $.workspace.activity.actions.updated);
}

function ProjectRoadmap({ epics }: { epics: Epic[] }) {
  const { t } = useT("projects");
  const paths = useWorkspacePaths();
  const plans = epics.map((epic) => {
    return {
      epic,
      start: epic.start_date,
      due: epic.target_date,
      total: epic.total_issues,
      done: epic.done_issues,
    };
  });
  const timestamps = plans.flatMap((plan) => [plan.start, plan.due]).filter((value): value is string => Boolean(value)).map(dateTimestamp);
  const rangeStart = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const rangeEnd = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const range = Math.max(rangeEnd - rangeStart, 86_400_000);
  const totalChildren = plans.reduce((sum, plan) => sum + plan.total, 0);
  const doneChildren = plans.reduce((sum, plan) => sum + plan.done, 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <h2 className="text-sm font-semibold">{t(($) => $.workspace.roadmap.title)}</h2>
          <p className="text-xs text-muted-foreground">{t(($) => $.workspace.roadmap.summary, { epics: plans.length, done: doneChildren, total: totalChildren })}</p>
        </div>
        <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[minmax(220px,0.8fr)_minmax(340px,1.4fr)] border-y text-xs">
          <div className="border-r px-3 py-2 font-medium text-muted-foreground">{t(($) => $.workspace.roadmap.epic)}</div>
          <div className="px-3 py-2 font-medium text-muted-foreground">{t(($) => $.workspace.roadmap.timeline)}</div>
          {plans.map((plan) => {
            const startTime = plan.start ? dateTimestamp(plan.start) : null;
            const dueTime = plan.due ? dateTimestamp(plan.due) : null;
            const left = startTime == null ? 0 : ((startTime - rangeStart) / range) * 100;
            const right = dueTime == null ? startTime : dueTime;
            const width = startTime == null ? 0 : Math.max((((right ?? startTime) - startTime) / range) * 100, 3);
            const percent = plan.total > 0 ? Math.round((plan.done / plan.total) * 100) : 0;
            return (
              <div key={plan.epic.id} className="contents">
                <div className="min-w-0 border-r border-t px-3 py-3">
                  <AppLink href={paths.epicDetail(plan.epic.id)} className="flex min-w-0 items-center gap-2 hover:underline">
                    <span className="shrink-0 text-xs text-muted-foreground">{plan.epic.identifier}</span>
                    <span className="truncate font-semibold">{plan.epic.title}</span>
                  </AppLink>
                </div>
                <div className="border-t px-3 py-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{plan.start ? displayDate(plan.start) : t(($) => $.workspace.roadmap.start_not_set)} - {plan.due ? displayDate(plan.due) : t(($) => $.workspace.roadmap.due_not_set)}</span>
                    <span>{t(($) => $.workspace.roadmap.done, { done: plan.done, total: plan.total })}</span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded bg-muted">
                    {startTime == null ? (
                      <div className="absolute inset-0 border border-dashed border-muted-foreground/30" />
                    ) : (
                      <div className="absolute h-full bg-sky-500/30" style={{ left: `${left}%`, width: `${width}%` }}>
                        <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-2 border-t px-3 py-10 text-center text-sm text-muted-foreground">
              {t(($) => $.workspace.roadmap.empty)}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function dateTimestamp(value: string) {
  return new Date(value).getTime();
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
