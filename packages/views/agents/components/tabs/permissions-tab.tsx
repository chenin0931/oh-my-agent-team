"use client";

import { Check, Hand, ShieldAlert, X } from "lucide-react";
import type { Agent } from "@ohmyagentteam/core/types";
import { useT } from "../../../i18n";

type Decision = "allow" | "ask" | "deny";

const POLICY_ROWS = [
  { action: "workspace_read", decision: "allow" },
  { action: "workspace_write", decision: "allow" },
  { action: "comment", decision: "allow" },
  { action: "progress_status", decision: "allow" },
  { action: "work_item_change", decision: "ask" },
  { action: "external_write", decision: "ask" },
  { action: "publish", decision: "ask" },
  { action: "critical_change", decision: "ask" },
  { action: "final_status", decision: "deny" },
  { action: "credential_read", decision: "deny" },
  { action: "outside_workspace", decision: "deny" },
] as const satisfies readonly { action: string; decision: Decision }[];

export function PermissionsTab({ agent }: { agent: Agent }) {
  const { t } = useT("agents");
  const invocation = agent.permission_mode === "private" ? "private" : "shared";
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">{t(($) => $.tab_body.permissions.title)}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{t(($) => $.tab_body.permissions.description)}</p>
      </div>
      <div className="border-y py-3">
        <p className="text-xs font-medium">{t(($) => $.tab_body.permissions.who_can_run)}</p>
        <p className="mt-1 text-sm">{t(($) => $.tab_body.permissions.invocation[invocation])}</p>
      </div>
      <div className="grid gap-px border bg-border sm:grid-cols-3">
        <DecisionSummary decision="allow" />
        <DecisionSummary decision="ask" />
        <DecisionSummary decision="deny" />
      </div>
      <div className="divide-y border-y">
        {POLICY_ROWS.map((row) => (
          <div key={row.action} className="flex items-center gap-3 py-3">
            <DecisionIcon decision={row.decision} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(($) => $.tab_body.permissions.actions[row.action])}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(($) => $.tab_body.permissions.decisions[row.decision])}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t(($) => $.tab_body.permissions.advisor_note)}</p>
    </div>
  );
}

function DecisionSummary({ decision }: { decision: Decision }) {
  const { t } = useT("agents");
  return <div className="flex items-center gap-2 bg-background p-4"><DecisionIcon decision={decision} /><div><p className="text-sm font-medium">{t(($) => $.tab_body.permissions.labels[decision])}</p><p className="text-xs text-muted-foreground">{t(($) => $.tab_body.permissions.summary[decision])}</p></div></div>;
}

function DecisionIcon({ decision }: { decision: Decision }) {
  const Icon = decision === "allow" ? Check : decision === "ask" ? Hand : X;
  const color = decision === "allow" ? "text-success" : decision === "ask" ? "text-warning" : "text-destructive";
  return <span className={`flex size-7 shrink-0 items-center justify-center border ${color}`}>{decision === "deny" ? <ShieldAlert className="size-4" /> : <Icon className="size-4" />}</span>;
}
