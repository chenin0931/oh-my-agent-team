"use client";

import { Bot, GitBranch, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@ohmyagentteam/core/types";
import { agentSessionsOptions, agentVersionsOptions } from "@ohmyagentteam/core/issues";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { AppLink } from "../../../navigation";
import { useT, useTimeAgo } from "../../../i18n";

const ACTIVE_STATUSES = new Set(["queued", "running", "waiting_approval", "waiting_input", "waiting_environment", "idle"]);

export function SessionsTab({ agent }: { agent: Agent }) {
  const { t } = useT("agents");
  const timeAgo = useTimeAgo();
  const workspaceId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const { data: sessions = [], isLoading } = useQuery(agentSessionsOptions(workspaceId, agent.id));
  const { data: versions = [] } = useQuery(agentVersionsOptions(workspaceId, agent.id));
  const latestVersion = versions[0];
  const activeCount = sessions.filter((session) => ACTIVE_STATUSES.has(session.status)).length;
  const roleLabel = (role: string | undefined) => {
    switch (role) {
      case "executor": return t(($) => $.tab_body.sessions.role.executor);
      case "advisor": return t(($) => $.tab_body.sessions.role.advisor);
      case "coordinator": return t(($) => $.tab_body.sessions.role.coordinator);
      case "reviewer": return t(($) => $.tab_body.sessions.role.reviewer);
      case "planner":
      case "planning": return t(($) => $.tab_body.sessions.role.planner);
      default: return role ?? "—";
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-px border bg-border sm:grid-cols-3">
        <Metric
          label={t(($) => $.tab_body.sessions.current_version)}
          value={t(($) => $.tab_body.sessions.version, { version: latestVersion?.version_number ?? "—" })}
        />
        <Metric label={t(($) => $.tab_body.sessions.open_sessions)} value={String(activeCount)} />
        <Metric label={t(($) => $.tab_body.sessions.total_sessions)} value={String(sessions.length)} />
      </div>
      {latestVersion ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y py-3 text-xs text-muted-foreground">
          <span>{t(($) => $.tab_body.sessions.snapshot_hash)} <code>{latestVersion.config_hash.slice(0, 10)}</code></span>
          <span>{latestVersion.model || t(($) => $.tab_body.sessions.provider_default)}</span>
          <span>{t(($) => $.tab_body.sessions.skill_count, { count: latestVersion.skill_count })}</span>
          <span>{timeAgo(latestVersion.created_at)}</span>
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold">{t(($) => $.tab_body.sessions.title)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.tab_body.sessions.description)}</p>
      </div>
      <div className="divide-y border-y">
        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t(($) => $.tab_body.sessions.loading)}</p>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <History className="mb-2 size-5 text-muted-foreground" />
            <p className="text-sm font-medium">{t(($) => $.tab_body.sessions.empty_title)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.tab_body.sessions.empty_description)}</p>
          </div>
        ) : (
          sessions.map((session) => {
            const thread = session.threads.find((item) => item.agent_id === agent.id) ?? session.threads[0];
            const content = (
              <div className="flex min-w-0 items-center gap-3 py-3">
                <span className={`size-2 shrink-0 rounded-full ${session.status === "running" ? "bg-success" : ACTIVE_STATUSES.has(session.status) ? "bg-warning" : "bg-muted-foreground/30"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{session.issue_title || session.goal}</p>
                  {session.issue_title && session.goal !== session.issue_title ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{session.goal}</p>
                  ) : null}
                </div>
                <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground md:flex">
                  <span className="inline-flex items-center gap-1"><Bot className="size-3.5" />{roleLabel(thread?.role || session.mode)}</span>
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="size-3.5" />
                    {t(($) => $.tab_body.sessions.version, { version: thread?.agent_version_number ?? "—" })}
                  </span>
                  <span>{t(($) => $.tab_body.sessions.status[session.status])}</span>
                  <span>{timeAgo(session.updated_at)}</span>
                </div>
              </div>
            );
            return session.issue_id ? <AppLink key={session.id} href={paths.issueDetail(session.issue_id)} className="block hover:bg-muted/50">{content}</AppLink> : <div key={session.id}>{content}</div>;
          })
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl">{value}</p></div>;
}
