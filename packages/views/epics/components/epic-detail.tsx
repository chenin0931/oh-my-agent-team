"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  BellOff,
  Bot,
  CheckCircle2,
  CircleAlert,
  FileText,
  Layers3,
  Link2,
  Loader2,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Send,
  Settings2,
  Trash2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Epic,
  EpicHealth,
  EpicLifecycle,
  EpicOwnerType,
  Issue,
  IssuePriority,
  TimelineEntry,
  UpdateEpicRequest,
} from "@ohmyagentteam/core/types";
import { api } from "@ohmyagentteam/core/api";
import {
  epicDetailOptions,
  epicKeys,
  epicSubscribersOptions,
  epicTimelineOptions,
  epicWorkItemsOptions,
} from "@ohmyagentteam/core/epics/queries";
import {
  useAttachEpicWorkItem,
  useDeleteEpic,
  useDetachEpicWorkItem,
  useUpdateEpic,
} from "@ohmyagentteam/core/epics/mutations";
import { projectDetailOptions, projectListOptions } from "@ohmyagentteam/core/projects/queries";
import { agentListOptions, memberListOptions } from "@ohmyagentteam/core/workspace/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useModalStore } from "@ohmyagentteam/core/modals";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import { useRecentIssuesStore } from "@ohmyagentteam/core/issues/stores";
import { pinListOptions } from "@ohmyagentteam/core/pins/queries";
import { useCreatePin, useDeletePin } from "@ohmyagentteam/core/pins/mutations";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { Input } from "@ohmyagentteam/ui/components/ui/input";
import { Label } from "@ohmyagentteam/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@ohmyagentteam/ui/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@ohmyagentteam/ui/components/ui/popover";
import { Progress } from "@ohmyagentteam/ui/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@ohmyagentteam/ui/components/ui/sheet";
import { Textarea } from "@ohmyagentteam/ui/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ohmyagentteam/ui/components/ui/tooltip";
import { useIsMobile } from "@ohmyagentteam/ui/hooks/use-mobile";
import { ActorAvatar } from "../../common/actor-avatar";
import { ContentEditor, type ContentEditorRef, ReadonlyContent } from "../../editor";
import { StatusIcon } from "../../issues/components/status-icon";
import { LabelPicker } from "../../issues/components/pickers/label-picker";
import { AppLink, useNavigation } from "../../navigation";
import { useT } from "../../i18n";

type EpicTab = "overview" | "work_items" | "updates";

const lifecycleValues: EpicLifecycle[] = ["planned", "in_progress", "paused", "completed", "cancelled"];
const healthValues: EpicHealth[] = ["on_track", "at_risk", "off_track"];
const priorityValues: IssuePriority[] = ["urgent", "high", "medium", "low", "none"];

export function EpicDetail({ epicId, onDone }: { epicId: string; onDone?: () => void }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const isMobile = useIsMobile();
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const { data: pins = [] } = useQuery({
    ...pinListOptions(wsId, userId),
    enabled: Boolean(userId),
  });
  const createPin = useCreatePin();
  const deletePin = useDeletePin();
  const {
    data: epic,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery(epicDetailOptions(wsId, epicId));
  const recordRecentVisit = useRecentIssuesStore((state) => state.recordVisit);
  const { data: project } = useQuery({
    ...projectDetailOptions(wsId, epic?.project_id ?? ""),
    enabled: Boolean(epic?.project_id),
  });
  const [tab, setTab] = useState<EpicTab>("overview");
  const isPinned = pins.some((pinItem) => pinItem.item_type === "epic" && pinItem.item_id === epicId);

  useEffect(() => {
    if (epic?.id) recordRecentVisit(wsId, epic.id);
  }, [epic?.id, recordRecentVisit, wsId]);

  if (isLoading) {
    return <EpicDetailLoading />;
  }

  if (isError || !epic?.id) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-background px-6 py-12">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-md border bg-muted/30 text-muted-foreground">
            <CircleAlert className="size-5" />
          </span>
          <h1 className="mt-4 font-serif text-xl font-semibold">{t(($) => $.epic.load_failed)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.epic.load_failed_description)}</p>
          <Button className="mt-5" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching && <Loader2 className="animate-spin" />}
            {t(($) => $.epic.retry)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b px-4 py-3 md:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-muted/30 text-muted-foreground">
            <Layers3 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {project && <AppLink href={paths.projectDetail(project.id)} className="truncate hover:text-foreground">{project.title}</AppLink>}
              {project && <span>/</span>}
              <span>{epic.identifier}</span>
              <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase">{t(($) => $.epic.planning_container)}</span>
            </div>
            <EditableEpicTitle epic={epic} />
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isPinned ? t(($) => $.detail.unpin_tooltip) : t(($) => $.detail.pin_tooltip)}
                  onClick={() => {
                    if (isPinned) deletePin.mutate({ itemType: "epic", itemId: epic.id });
                    else createPin.mutate({ item_type: "epic", item_id: epic.id });
                  }}
                />
              }
            >
              {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </TooltipTrigger>
            <TooltipContent>{isPinned ? t(($) => $.detail.unpin_tooltip) : t(($) => $.detail.pin_tooltip)}</TooltipContent>
          </Tooltip>
          {isMobile && (
            <Sheet>
              <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t(($) => $.detail.section_properties)} />}>
                <Settings2 className="size-4" />
              </SheetTrigger>
              <SheetContent className="w-[min(88vw,360px)] overflow-y-auto">
                <SheetHeader><SheetTitle>{t(($) => $.detail.section_properties)}</SheetTitle></SheetHeader>
                <EpicProperties epic={epic} onDeleted={() => { onDone?.(); navigation.push(paths.projectDetail(epic.project_id)); }} />
              </SheetContent>
            </Sheet>
          )}
        </div>
        <nav className="mt-3 flex gap-1" aria-label={t(($) => $.epic.title)}>
          {(["overview", "work_items", "updates"] as const).map((value) => {
            const Icon = value === "overview" ? Activity : value === "work_items" ? CheckCircle2 : MessageSquare;
            return (
              <button
                type="button"
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs text-muted-foreground",
                  tab === value && "border-foreground text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {t(($) => $.epic[value])}
                {value === "work_items" && <span className="tabular-nums">{epic.total_issues}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_288px]">
        <main className="min-h-0 overflow-y-auto">
          {tab === "overview" && <EpicOverview epic={epic} />}
          {tab === "work_items" && <EpicWorkItems epic={epic} />}
          {tab === "updates" && <EpicUpdates epic={epic} />}
        </main>
        {!isMobile && (
          <aside className="min-h-0 overflow-y-auto border-l bg-muted/10">
            <EpicProperties epic={epic} onDeleted={() => { onDone?.(); navigation.push(paths.projectDetail(epic.project_id)); }} />
          </aside>
        )}
      </div>
    </div>
  );
}

function EditableEpicTitle({ epic }: { epic: Epic }) {
  const { t } = useT("projects");
  const update = useUpdateEpic();
  const [title, setTitle] = useState(epic.title);
  const save = () => {
    const next = title.trim();
    if (!next) {
      setTitle(epic.title);
      return;
    }
    if (next !== epic.title) {
      update.mutate({ id: epic.id, title: next }, { onError: () => toast.error(t(($) => $.epic.update_failed)) });
    }
  };
  return (
    <Input
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      className="mt-1 h-auto border-0 bg-transparent p-0 font-serif text-xl font-semibold shadow-none focus-visible:ring-0 md:text-2xl"
      aria-label={t(($) => $.epic.title)}
    />
  );
}

function EpicOverview({ epic }: { epic: Epic }) {
  const { t } = useT("projects");
  const update = useUpdateEpic();
  return (
    <div className="mx-auto max-w-4xl px-5 py-6 md:px-8 md:py-8">
      <section className="border-b pb-7">
        <SectionHeading icon={FileText} title={t(($) => $.epic.description)} />
        <EditableMarkdown
          value={epic.description ?? ""}
          empty={t(($) => $.epic.no_description)}
          onSave={(description) =>
            update.mutateAsync({ id: epic.id, description: description || null })
          }
        />
      </section>
      <section className="border-b py-7">
        <SectionHeading icon={CheckCircle2} title={t(($) => $.epic.success_criteria)} />
        <EditableMarkdown
          value={epic.success_criteria ?? ""}
          empty={t(($) => $.epic.no_success)}
          onSave={(success_criteria) =>
            update.mutateAsync({
              id: epic.id,
              success_criteria: success_criteria || null,
            })
          }
        />
      </section>
      <section className="py-7">
        <SectionHeading icon={Activity} title={t(($) => $.epic.progress)} />
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <strong className="font-serif text-3xl font-semibold tabular-nums">{epic.completion_percent}%</strong>
            <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.epic.completion, { done: epic.done_issues, total: epic.total_issues })}</p>
          </div>
          {epic.blocked_issues > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <CircleAlert className="size-3.5" /> {t(($) => $.epic.blocked, { count: epic.blocked_issues })}
            </span>
          )}
        </div>
        <Progress value={epic.completion_percent} className="mt-4" />
        <div className="mt-6">
          <p className="text-xs font-medium text-muted-foreground">{t(($) => $.epic.status_distribution)}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(epic.status_distribution).map(([status, count]) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-xs">
                <StatusIcon status={status as Issue["status"]} className="size-3.5" />
                <span className="capitalize">{status.replaceAll("_", " ")}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function EditableMarkdown({ value, empty, onSave }: { value: string; empty: string; onSave: (value: string) => Promise<unknown> }) {
  const { t } = useT("projects");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch {
      toast.error(t(($) => $.epic.update_failed));
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <div className="mt-3">
        <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-36 resize-y" autoFocus />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setDraft(value); setEditing(false); }}>{t(($) => $.delete_dialog.cancel)}</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="size-3.5 animate-spin" />}{t(($) => $.epic.send)}</Button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="group mt-3 block w-full rounded-md px-2 py-2 text-left hover:bg-muted/40">
      {value ? <ReadonlyContent content={value} /> : <p className="text-sm text-muted-foreground">{empty}</p>}
      <Pencil className="mt-2 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function EpicWorkItems({ epic }: { epic: Epic }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const openModal = useModalStore((state) => state.open);
  const { data: items = [], isLoading } = useQuery(epicWorkItemsOptions(wsId, epic.id));
  const { data: candidatesResponse } = useQuery(queryOptions({
    queryKey: ["epics", wsId, epic.id, "attach-candidates"],
    queryFn: () => api.listIssues({ project_id: epic.project_id, issue_type: "issue", limit: 100 }),
  }));
  const detach = useDetachEpicWorkItem();
  const attach = useAttachEpicWorkItem();
  const topLevel = items.filter((item) => (item.issue_type ?? "issue") === "issue");
  const children = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const item of items) {
      if (!item.parent_issue_id) continue;
      const list = map.get(item.parent_issue_id) ?? [];
      list.push(item);
      map.set(item.parent_issue_id, list);
    }
    return map;
  }, [items]);
  const candidates = (candidatesResponse?.issues ?? []).filter((item) => !item.epic_id);

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <div>
          <h2 className="font-serif text-lg font-semibold">{t(($) => $.epic.work_items)}</h2>
          <p className="text-xs text-muted-foreground">{t(($) => $.epic.completion, { done: epic.done_issues, total: epic.total_issues })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <Link2 className="size-3.5" /> {t(($) => $.epic.attach_existing)}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1">
              <div className="max-h-64 overflow-y-auto">
                {candidates.map((issue) => (
                  <button
                    type="button"
                    key={issue.id}
                    onClick={() => attach.mutate({ epicId: epic.id, issueId: issue.id })}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-accent"
                  >
                    <StatusIcon status={issue.status} className="size-3.5" />
                    <span className="shrink-0 text-xs text-muted-foreground">{issue.identifier}</span>
                    <span className="truncate text-sm">{issue.title}</span>
                  </button>
                ))}
                {candidates.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t(($) => $.epic.no_work_items)}</p>}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={() => openModal("create-issue", { issue_type: "issue", status: "backlog", project_id: epic.project_id, epic_id: epic.id })}>
            <Plus className="size-3.5" /> {t(($) => $.epic.add_issue)}
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {topLevel.map((issue) => (
          <div key={issue.id} className="py-3">
            <div className="group flex min-h-10 items-center gap-2">
              <StatusIcon status={issue.status} className="size-4" />
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{issue.identifier}</span>
              <AppLink href={paths.issueDetail(issue.id)} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{issue.title}</AppLink>
              {issue.assignee_type && issue.assignee_id && <ActorAvatar actorType={issue.assignee_type} actorId={issue.assignee_id} size={20} enableHoverCard />}
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => detach.mutate({ epicId: epic.id, issueId: issue.id })} />}>
                  <Unlink className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>{t(($) => $.epic.detach)}</TooltipContent>
              </Tooltip>
            </div>
            {(children.get(issue.id) ?? []).map((subtask) => (
              <div key={subtask.id} className="ml-8 flex min-h-8 items-center gap-2 border-l pl-4">
                <StatusIcon status={subtask.status} className="size-3.5" />
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{subtask.identifier}</span>
                <AppLink href={paths.issueDetail(subtask.id)} className="min-w-0 flex-1 truncate text-sm hover:underline">{subtask.title}</AppLink>
              </div>
            ))}
          </div>
        ))}
        {!isLoading && topLevel.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">{t(($) => $.epic.no_work_items)}</p>}
      </div>
    </div>
  );
}

function EpicUpdates({ epic }: { epic: Epic }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const { data: timeline = [], isLoading } = useQuery(epicTimelineOptions(wsId, epic.id));
  return (
    <div className="mx-auto max-w-3xl px-5 py-6 md:px-8">
      <h2 className="font-serif text-lg font-semibold">{t(($) => $.epic.updates)}</h2>
      <div className="mt-5 space-y-5">
        {timeline.map((entry) => <EpicTimelineEntry key={`${entry.type}:${entry.id}`} entry={entry} />)}
        {!isLoading && timeline.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t(($) => $.epic.no_updates)}</p>}
      </div>
      <EpicUpdateComposer epicId={epic.id} />
    </div>
  );
}

function EpicTimelineEntry({ entry }: { entry: TimelineEntry }) {
  const authorType = entry.actor_type || "system";
  const isComment = entry.type === "comment";
  return (
    <article className="flex gap-3">
      {authorType === "system" ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-muted"><Activity className="size-3.5 text-muted-foreground" /></span>
      ) : (
        <ActorAvatar actorType={authorType} actorId={entry.actor_id} size={28} enableHoverCard />
      )}
      <div className="min-w-0 flex-1 border-b pb-5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="capitalize">{authorType === "agent" ? "Agent" : authorType}</span>
          <time>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.created_at))}</time>
        </div>
        {isComment && entry.content ? (
          <ReadonlyContent content={entry.content} attachments={entry.attachments} className="mt-2" />
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">{(entry.action ?? "updated").replaceAll("_", " ")}</p>
        )}
      </div>
    </article>
  );
}

function EpicUpdateComposer({ epicId }: { epicId: string }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const ref = useRef<ContentEditorRef>(null);
  const [empty, setEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const content = ref.current?.getMarkdown().trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await api.createEpicComment(epicId, content);
      ref.current?.clearContent();
      setEmpty(true);
      await qc.invalidateQueries({ queryKey: epicKeys.timeline(wsId, epicId) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.epic.update_failed));
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="relative mt-8 rounded-md border bg-card pb-10">
      <div className="min-h-24 px-3 py-2">
        <ContentEditor
          ref={ref}
          placeholder={t(($) => $.epic.comment_placeholder)}
          onUpdate={(value) => setEmpty(!value.trim())}
          onSubmit={() => void submit()}
          mentionAllowedTypes={["member", "agent", "epic", "issue", "project", "all"]}
          showBubbleMenu
        />
      </div>
      <Button size="sm" className="absolute bottom-2 right-2" disabled={empty || sending} onClick={() => void submit()}>
        {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        {t(($) => $.epic.send)}
      </Button>
    </div>
  );
}

function EpicProperties({ epic, onDeleted }: { epic: Epic; onDeleted: () => void }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const update = useUpdateEpic();
  const remove = useDeleteEpic();
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: subscribers = [] } = useQuery(epicSubscribersOptions(wsId, epic.id));
  const [advisorId, setAdvisorId] = useState("");
  const [advisorPrompt, setAdvisorPrompt] = useState("");
  const [advisorPending, setAdvisorPending] = useState(false);
  const [subscriptionPending, setSubscriptionPending] = useState(false);
  const activeAgents = agents.filter((agent) => !agent.archived_at);
  const isSubscribed = subscribers.some(
    (subscriber) => subscriber.user_type === "member" && subscriber.user_id === userId,
  );

  const patch = (data: UpdateEpicRequest) => {
    update.mutate({ id: epic.id, ...data }, { onError: () => toast.error(t(($) => $.epic.update_failed)) });
  };
  const ownerValue = epic.owner_type && epic.owner_id ? `${epic.owner_type}:${epic.owner_id}` : "";
  const runAdvisor = async () => {
    if (!advisorId || advisorPending) return;
    setAdvisorPending(true);
    try {
      await api.runEpicAdvisor(epic.id, { agent_id: advisorId, prompt: advisorPrompt.trim() || undefined });
      setAdvisorPrompt("");
      toast.success(t(($) => $.epic.advisor_queued));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.epic.update_failed));
    } finally {
      setAdvisorPending(false);
    }
  };
  const toggleSubscription = async () => {
    if (!userId || subscriptionPending) return;
    setSubscriptionPending(true);
    try {
      if (isSubscribed) await api.unsubscribeFromEpic(epic.id, userId, "member");
      else await api.subscribeToEpic(epic.id, userId, "member");
      await qc.invalidateQueries({ queryKey: epicKeys.subscribers(wsId, epic.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.epic.update_failed));
    } finally {
      setSubscriptionPending(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-3">
        <Property label={t(($) => $.epic.lifecycle)}>
          <NativeSelect className="w-full" size="sm" value={epic.lifecycle} onChange={(event) => patch({ lifecycle: event.target.value as EpicLifecycle })}>
            {lifecycleValues.map((value) => <NativeSelectOption key={value} value={value}>{t(($) => $.epic.statuses[value])}</NativeSelectOption>)}
          </NativeSelect>
        </Property>
        <Property label={t(($) => $.epic.health)}>
          <NativeSelect className="w-full" size="sm" value={epic.health ?? ""} onChange={(event) => patch({ health: (event.target.value || null) as EpicHealth | null })}>
            <NativeSelectOption value="">{t(($) => $.epic.health_none)}</NativeSelectOption>
            {healthValues.map((value) => <NativeSelectOption key={value} value={value}>{t(($) => $.epic.healths[value])}</NativeSelectOption>)}
          </NativeSelect>
        </Property>
        <Property label={t(($) => $.epic.owner)}>
          <NativeSelect
            className="w-full"
            size="sm"
            value={ownerValue}
            onChange={(event) => {
              const [owner_type, owner_id] = event.target.value.split(":") as [EpicOwnerType | "", string | undefined];
              patch({ owner_type: owner_type || null, owner_id: owner_id || null });
            }}
          >
            <NativeSelectOption value="">{t(($) => $.epic.unassigned)}</NativeSelectOption>
            <NativeSelectOptGroup label={t(($) => $.lead.members_group)}>
              {members.map((member) => <NativeSelectOption key={member.user_id} value={`member:${member.user_id}`}>{member.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label={t(($) => $.lead.agents_group)}>
              {activeAgents.map((agent) => <NativeSelectOption key={agent.id} value={`agent:${agent.id}`}>{agent.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          </NativeSelect>
        </Property>
        <Property label={t(($) => $.epic.project)}>
          <NativeSelect className="w-full" size="sm" value={epic.project_id} onChange={(event) => patch({ project_id: event.target.value })}>
            {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.title}</NativeSelectOption>)}
          </NativeSelect>
        </Property>
        <Property label={t(($) => $.epic.priority)}>
          <NativeSelect className="w-full" size="sm" value={epic.priority} onChange={(event) => patch({ priority: event.target.value as IssuePriority })}>
            {priorityValues.map((value) => <NativeSelectOption key={value} value={value}>{t(($) => $.priority[value])}</NativeSelectOption>)}
          </NativeSelect>
        </Property>
        <Property label={t(($) => $.epic.labels)}>
          <LabelPicker issueId={epic.id} targetType="epic" align="end" />
        </Property>
        <div className="grid grid-cols-2 gap-2">
          <Property label={t(($) => $.epic.start_date)}>
            <Input type="date" value={epic.start_date ?? ""} onChange={(event) => patch({ start_date: event.target.value || null })} className="h-7 text-xs" />
          </Property>
          <Property label={t(($) => $.epic.target_date)}>
            <Input type="date" value={epic.target_date ?? ""} onChange={(event) => patch({ target_date: event.target.value || null })} className="h-7 text-xs" />
          </Property>
        </div>
      </div>

      <section className="border-t pt-5">
        <h3 className="flex items-center gap-2 text-xs font-semibold"><Bot className="size-3.5" />{t(($) => $.epic.advisors)}</h3>
        <NativeSelect className="mt-3 w-full" size="sm" value={advisorId} onChange={(event) => setAdvisorId(event.target.value)}>
          <NativeSelectOption value="">{t(($) => $.epic.choose_agent)}</NativeSelectOption>
          {activeAgents.map((agent) => <NativeSelectOption key={agent.id} value={agent.id}>{agent.name}</NativeSelectOption>)}
        </NativeSelect>
        <Textarea value={advisorPrompt} onChange={(event) => setAdvisorPrompt(event.target.value)} placeholder={t(($) => $.epic.advisor_prompt)} className="mt-2 min-h-16 resize-y text-xs" />
        <Button variant="outline" size="sm" className="mt-2 w-full" disabled={!advisorId || advisorPending} onClick={() => void runAdvisor()}>
          {advisorPending ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}{t(($) => $.epic.analyze)}
        </Button>
      </section>

      <section className="border-t pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">{t(($) => $.epic.subscribers)} <span className="font-normal text-muted-foreground">{subscribers.length}</span></h3>
          <Button
            variant="ghost"
            size="xs"
            disabled={!userId || subscriptionPending}
            onClick={() => void toggleSubscription()}
          >
            {isSubscribed ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
            {t(($) => isSubscribed ? $.epic.unsubscribe : $.epic.subscribe)}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {subscribers.slice(0, 12).map((subscriber) => <ActorAvatar key={`${subscriber.user_type}:${subscriber.user_id}`} actorType={subscriber.user_type} actorId={subscriber.user_id} size={22} enableHoverCard />)}
        </div>
      </section>

      {(epic.attachments?.length ?? 0) > 0 && (
        <section className="border-t pt-5">
          <h3 className="text-xs font-semibold">{t(($) => $.epic.attachments)}</h3>
          <div className="mt-2 space-y-1">
            {epic.attachments?.map((attachment) => (
              <a key={attachment.id} href={attachment.download_url || attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent">
                <FileText className="size-3.5 text-muted-foreground" /><span className="truncate">{attachment.filename}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="border-t pt-5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={() => {
            if (!window.confirm(t(($) => $.epic.delete_confirm))) return;
            remove.mutate(epic.id, { onSuccess: onDeleted });
          }}
        >
          <Trash2 className="size-3.5" /> {t(($) => $.epic.delete)}
        </Button>
      </section>
    </div>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>{children}</div>;
}

function SectionHeading({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return <h2 className="flex items-center gap-2 font-serif text-base font-semibold"><Icon className="size-4 text-muted-foreground" />{title}</h2>;
}

function EpicDetailLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-pulse">
      <div className="h-28 border-b bg-muted/20" />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_288px]">
        <div className="space-y-8 p-8"><div className="h-6 w-40 rounded bg-muted" /><div className="h-28 rounded bg-muted/60" /><div className="h-6 w-32 rounded bg-muted" /><div className="h-20 rounded bg-muted/60" /></div>
        <div className="hidden border-l bg-muted/10 lg:block" />
      </div>
    </div>
  );
}
