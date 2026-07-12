"use client";

import type { Issue } from "@ohmyagentteam/core/types";
import { useState } from "react";
import { Bot, Eye, ListTree, Play, ScrollText, Users } from "lucide-react";
import { ActorAvatar } from "../../common/actor-avatar";
import { useActorName } from "@ohmyagentteam/core/workspace/hooks";
import { api } from "@ohmyagentteam/core/api";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { toast } from "sonner";
import { useT } from "../../i18n";

type Subscriber = { user_type: string; user_id: string };

export function WorkItemAgentPanel({ issue, subscribers, canDecompose = false }: { issue: Issue; subscribers: Subscriber[]; canDecompose?: boolean }) {
  const { t } = useT("issues");
  const { getActorName } = useActorName();
  const [pendingAction, setPendingAction] = useState<"continue" | "summarize" | "decompose" | null>(null);
  const advisors = subscribers.filter(
    (subscriber) => subscriber.user_type === "agent" &&
      !(issue.assignee_type === "agent" && issue.assignee_id === subscriber.user_id),
  );
  const hasAgentExecutor = issue.assignee_type === "agent" || issue.assignee_type === "squad";
  const canContinue = hasAgentExecutor && ["todo", "in_progress", "in_review", "blocked"].includes(issue.status);

  const runAction = async (action: "continue" | "summarize" | "decompose") => {
    setPendingAction(action);
    try {
      await api.runIssueAgentAction(issue.id, { action });
      toast.success(t(($) => $.detail.agent_action_started));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.detail.agent_action_failed));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        <Users className="size-3.5 text-muted-foreground" />
        {t(($) => $.detail.collaboration_section)}
      </div>
      <div className="space-y-2 pl-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">{t(($) => $.detail.executor_label)}</span>
          {issue.assignee_type && issue.assignee_id ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <ActorAvatar actorType={issue.assignee_type} actorId={issue.assignee_id} size={18} enableHoverCard />
              <span className="truncate">{getActorName(issue.assignee_type, issue.assignee_id)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{t(($) => $.detail.no_executor)}</span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">{t(($) => $.detail.advisors_label)}</span>
          {advisors.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {advisors.map((advisor) => (
                <span key={advisor.user_id} className="inline-flex items-center gap-1">
                  <ActorAvatar actorType="agent" actorId={advisor.user_id} size={18} enableHoverCard />
                  <span>{getActorName("agent", advisor.user_id)}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Bot className="size-3.5" />{t(($) => $.detail.no_advisors)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Eye className="size-3.5" />
          <span>{t(($) => $.detail.subscriber_count, { count: subscribers.length })}</span>
        </div>
        {issue.issue_type === "epic" && (
          <p className="text-muted-foreground">{t(($) => $.detail.epic_no_execution)}</p>
        )}
        {issue.issue_type !== "epic" && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {canContinue && (
              <Button size="sm" variant="outline" disabled={pendingAction !== null} onClick={() => runAction("continue")}>
                <Play className="size-3.5" />
                {t(($) => $.detail.agent_action_continue)}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pendingAction !== null} onClick={() => runAction("summarize")}>
              <ScrollText className="size-3.5" />
              {t(($) => $.detail.agent_action_summarize)}
            </Button>
            {canDecompose && hasAgentExecutor && (
              <Button size="sm" variant="outline" disabled={pendingAction !== null} onClick={() => runAction("decompose")}>
                <ListTree className="size-3.5" />
                {t(($) => $.detail.agent_action_decompose)}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
