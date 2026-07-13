"use client";

import type { ReactNode } from "react";
import {
  Bot,
  CircleUserRound,
  FolderKanban,
  MonitorCog,
  UsersRound,
} from "lucide-react";
import type {
  AgentRuntime,
  Issue,
  MemberWithUser,
  Squad,
} from "@ohmyagentteam/core/types";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { availabilityConfig } from "../presence";
import type { AgentListRow } from "./agents-page";
import { useT } from "../../i18n";

const ACTIVE_STATUSES = new Set(["todo", "in_progress", "in_review", "blocked"]);

export function CollaborationNetworkOverview({
  members,
  rows,
  squads,
  runtimes,
  issues,
  currentUserId,
}: {
  members: MemberWithUser[];
  rows: AgentListRow[];
  squads: Squad[];
  runtimes: AgentRuntime[];
  issues: Issue[];
  currentUserId?: string | null;
}) {
  const { t } = useT("agents");
  const paths = useWorkspacePaths();
  const activeIssues = issues.filter(
    (issue) => issue.issue_type !== "epic" && ACTIVE_STATUSES.has(issue.status),
  );
  const activeSquads = squads.filter((squad) => !squad.archived_at);
  const onlineAgents = rows.filter(
    (row) => row.presence?.availability === "online",
  ).length;
  const sharedAgents = rows.filter(
    (row) => row.agent.visibility === "workspace",
  ).length;
  const onlineRuntimes = runtimes.filter(
    (runtime) => runtime.status === "online",
  ).length;
  const workingAgents = rows.filter(
    (row) => (row.presence?.runningCount ?? 0) > 0,
  ).length;
  const ownedByMember = new Map<string, AgentListRow[]>();
  for (const row of rows) {
    if (!row.agent.owner_id) continue;
    ownedByMember.set(row.agent.owner_id, [
      ...(ownedByMember.get(row.agent.owner_id) ?? []),
      row,
    ]);
  }
  const squadsByOwner = new Map<string, Squad[]>();
  for (const squad of activeSquads) {
    squadsByOwner.set(squad.owner_id, [
      ...(squadsByOwner.get(squad.owner_id) ?? []),
      squad,
    ]);
  }
  const myMember = members.find((member) => member.user_id === currentUserId);
  const otherMembers = members.filter((member) => member.user_id !== currentUserId);
  const unowned = rows.filter(
    (row) =>
      !row.agent.owner_id ||
      !members.some((member) => member.user_id === row.agent.owner_id),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-2 border-b bg-muted/15 md:grid-cols-3 xl:grid-cols-6">
        <NetworkMetric icon={CircleUserRound} label={t(($) => $.network.metrics.people)} value={members.length} />
        <NetworkMetric icon={Bot} label={t(($) => $.network.metrics.agents)} value={rows.length} hint={t(($) => $.network.metrics.online_hint, { count: onlineAgents })} />
        <NetworkMetric icon={UsersRound} label={t(($) => $.network.metrics.squads)} value={activeSquads.length} />
        <NetworkMetric icon={FolderKanban} label={t(($) => $.network.metrics.active_work)} value={activeIssues.length} hint={t(($) => $.network.metrics.working_hint, { count: workingAgents })} />
        <NetworkMetric icon={MonitorCog} label={t(($) => $.network.metrics.capacity)} value={`${onlineRuntimes}/${runtimes.length}`} />
        <NetworkMetric icon={Bot} label={t(($) => $.network.metrics.shared_agents)} value={sharedAgents} />
      </div>

      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <main className="min-w-0 px-5 py-5 xl:border-r">
          <TeamGroup
            title={t(($) => $.network.my_team_title)}
            description={t(($) => $.network.my_team_description)}
            count={myMember ? 1 : 0}
          >
            {myMember ? (
              <TeamMemberRow
                member={myMember}
                ownedAgents={ownedByMember.get(myMember.user_id) ?? []}
                ownedSquads={squadsByOwner.get(myMember.user_id) ?? []}
                activeIssues={activeIssues}
                currentUserId={currentUserId}
              />
            ) : (
              <EmptyNetworkRow label={t(($) => $.network.my_team_empty)} />
            )}
          </TeamGroup>

          <TeamGroup
            title={t(($) => $.network.other_teams_title)}
            description={t(($) => $.network.other_teams_description)}
            count={otherMembers.length}
            className="mt-8"
          >
            {otherMembers.length > 0 ? (
              otherMembers.map((member) => (
                <TeamMemberRow
                  key={member.user_id}
                  member={member}
                  ownedAgents={ownedByMember.get(member.user_id) ?? []}
                  ownedSquads={squadsByOwner.get(member.user_id) ?? []}
                  activeIssues={activeIssues}
                  currentUserId={currentUserId}
                />
              ))
            ) : (
              <EmptyNetworkRow label={t(($) => $.network.other_teams_empty)} />
            )}
          </TeamGroup>

          {unowned.length > 0 ? (
            <section className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-serif text-[15px] font-medium text-muted-foreground">
                  {t(($) => $.network.unowned_agents)}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {unowned.length}
                </span>
              </div>
              <div className="grid gap-2 border-y py-3 sm:grid-cols-2 2xl:grid-cols-3">
                {unowned.map((row) => (
                  <AgentNetworkCell key={row.agent.id} row={row} activeIssues={activeIssues} />
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="min-w-0 px-5 py-5">
          <NetworkSideSection title={t(($) => $.network.squads_title)} count={activeSquads.length}>
            {activeSquads.map((squad) => {
              const leader = rows.find((row) => row.agent.id === squad.leader_id);
              const owner = members.find((member) => member.user_id === squad.owner_id);
              return (
                <AppLink key={squad.id} href={paths.squadDetail(squad.id)} className="flex min-w-0 items-center gap-2.5 border-t py-3 hover:bg-accent/40">
                  <ActorAvatar actorType="squad" actorId={squad.id} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{squad.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {owner?.name ?? t(($) => $.network.unowned_agents)} · {leader?.agent.name ?? t(($) => $.network.no_leader)}
                    </p>
                  </div>
                </AppLink>
              );
            })}
            {activeSquads.length === 0 ? <EmptyNetworkRow label={t(($) => $.network.no_squads)} /> : null}
          </NetworkSideSection>

          <NetworkSideSection title={t(($) => $.network.capacity_title)} count={runtimes.length} className="mt-7">
            {runtimes.map((runtime) => {
              const assignedAgents = rows.filter(
                (row) => row.agent.runtime_id === runtime.id,
              ).length;
              return (
                <AppLink key={runtime.id} href={paths.runtimeDetail(runtime.id)} className="flex min-w-0 items-center gap-2.5 border-t py-3 hover:bg-accent/40">
                  <span className={cn("size-2 shrink-0 rounded-full", runtime.status === "online" ? "bg-success" : "bg-muted-foreground/30")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{runtime.custom_name || runtime.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{runtime.provider} · {t(($) => $.network.agent_count, { count: assignedAgents })}</p>
                  </div>
                </AppLink>
              );
            })}
            {runtimes.length === 0 ? <EmptyNetworkRow label={t(($) => $.network.no_capacity)} /> : null}
          </NetworkSideSection>
        </aside>
      </div>
    </div>
  );
}

function TeamGroup({
  title,
  description,
  count,
  children,
  className,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="divide-y border-y">{children}</div>
    </section>
  );
}

function TeamMemberRow({
  member,
  ownedAgents,
  ownedSquads,
  activeIssues,
  currentUserId,
}: {
  member: MemberWithUser;
  ownedAgents: AgentListRow[];
  ownedSquads: Squad[];
  activeIssues: Issue[];
  currentUserId?: string | null;
}) {
  const { t } = useT("agents");
  const paths = useWorkspacePaths();
  const directWork = activeIssues.filter(
    (issue) =>
      issue.assignee_type === "member" && issue.assignee_id === member.user_id,
  ).length;
  const agentIds = new Set(ownedAgents.map((row) => row.agent.id));
  const delegatedWork = activeIssues.filter(
    (issue) =>
      issue.assignee_type === "agent" &&
      !!issue.assignee_id &&
      agentIds.has(issue.assignee_id),
  ).length;

  return (
    <div className="grid gap-3 py-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      <div className="flex min-w-0 items-start gap-2.5 px-1">
        <AppLink href={paths.memberDetail(member.user_id)} className="shrink-0">
          <ActorAvatar actorType="member" actorId={member.user_id} size={34} enableHoverCard />
        </AppLink>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <AppLink href={paths.memberDetail(member.user_id)} className="truncate text-sm font-medium hover:underline">
              {member.name}
            </AppLink>
            {member.user_id === currentUserId ? (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{t(($) => $.row.you)}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(($) => $.network.roles[member.role])}
          </p>
          <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
            {t(($) => $.network.workload_summary, { direct: directWork, delegated: delegatedWork })}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {ownedAgents.map((row) => (
          <AgentNetworkCell key={row.agent.id} row={row} activeIssues={activeIssues} />
        ))}
        {ownedSquads.map((squad) => (
          <SquadNetworkCell key={squad.id} squad={squad} />
        ))}
        {ownedAgents.length === 0 && ownedSquads.length === 0 ? (
          <div className="flex min-h-14 items-center border border-dashed px-3 text-xs text-muted-foreground">
            {t(($) => $.network.no_owned_team_assets)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AgentNetworkCell({ row, activeIssues }: { row: AgentListRow; activeIssues: Issue[] }) {
  const { t } = useT("agents");
  const paths = useWorkspacePaths();
  const activeCount = activeIssues.filter(
    (issue) => issue.assignee_type === "agent" && issue.assignee_id === row.agent.id,
  ).length;
  const availability = row.presence?.availability ?? null;
  const visual = availability ? availabilityConfig[availability] : null;
  return (
    <AppLink href={paths.agentDetail(row.agent.id)} className="flex min-h-14 min-w-0 items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 hover:border-foreground/20 hover:bg-accent/30">
      <ActorAvatar actorType="agent" actorId={row.agent.id} size={28} showStatusDot />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium">{row.agent.name}</span>
          {row.agent.visibility === "workspace" ? <span className="shrink-0 rounded bg-info/10 px-1 text-[9px] text-info">{t(($) => $.network.shared)}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          <span className={visual?.textClass}>{availability ? t(($) => $.availability[availability]) : "-"}</span>
          {" · "}{t(($) => $.network.active_issue_count, { count: activeCount })}
        </p>
      </div>
    </AppLink>
  );
}

function SquadNetworkCell({ squad }: { squad: Squad }) {
  const { t } = useT("agents");
  const paths = useWorkspacePaths();
  return (
    <AppLink href={paths.squadDetail(squad.id)} className="flex min-h-14 min-w-0 items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 hover:border-foreground/20 hover:bg-accent/30">
      <ActorAvatar actorType="squad" actorId={squad.id} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{squad.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {t(($) => $.network.squad_asset)} · {t(($) => $.network.member_count, { count: squad.member_count ?? 0 })}
        </p>
      </div>
    </AppLink>
  );
}

function NetworkMetric({ icon: Icon, label, value, hint }: { icon: typeof Bot; label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 border-b border-r px-4 py-3 md:border-b-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="size-3.5" />{label}</div>
      <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-semibold tabular-nums">{value}</span>{hint ? <span className="truncate text-[10px] text-muted-foreground">{hint}</span> : null}</div>
    </div>
  );
}

function NetworkSideSection({ title, count, children, className }: { title: string; count: number; children: ReactNode; className?: string }) {
  return <section className={className}><div className="mb-1 flex items-center justify-between"><h2 className="font-serif text-[15px] font-medium">{title}</h2><span className="text-xs tabular-nums text-muted-foreground">{count}</span></div>{children}</section>;
}

function EmptyNetworkRow({ label }: { label: string }) {
  return <p className="py-5 text-center text-xs text-muted-foreground">{label}</p>;
}
