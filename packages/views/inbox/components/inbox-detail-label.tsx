"use client";

import { formatDateOnly } from "@ohmyagentteam/core/issues/date";
import { useActorName } from "@ohmyagentteam/core/workspace/hooks";
import { StatusIcon, PriorityIcon } from "../../issues/components";
import type { InboxItem, InboxItemType, IssueStatus, IssuePriority } from "@ohmyagentteam/core/types";
import { getQuickCreateFailureDetail } from "./inbox-display";
import { useT } from "../../i18n";

// Hook returning the inbox-item type → human label map. Replaces the
// previous static `typeLabels` const so the labels can flow through
// i18next. Call sites keep the same `typeLabels[type]` access pattern.
export function useTypeLabels(): Record<InboxItemType, string> {
  const { t } = useT("inbox");
  return {
    epic_owned: t(($) => $.types.epic_owned),
    issue_assigned: t(($) => $.types.issue_assigned),
    issue_subscribed: t(($) => $.types.issue_subscribed),
    unassigned: t(($) => $.types.unassigned),
    assignee_changed: t(($) => $.types.assignee_changed),
    status_changed: t(($) => $.types.status_changed),
    priority_changed: t(($) => $.types.priority_changed),
    start_date_changed: t(($) => $.types.start_date_changed),
    due_date_changed: t(($) => $.types.due_date_changed),
    new_comment: t(($) => $.types.new_comment),
    mentioned: t(($) => $.types.mentioned),
    review_requested: t(($) => $.types.review_requested),
    task_completed: t(($) => $.types.task_completed),
    task_failed: t(($) => $.types.task_failed),
    agent_blocked: t(($) => $.types.agent_blocked),
    agent_completed: t(($) => $.types.agent_completed),
    session_approval: t(($) => $.types.session_approval),
    session_waiting_input: t(($) => $.types.session_waiting_input),
    session_waiting_environment: t(($) => $.types.session_waiting_environment),
    outcome_failed: t(($) => $.types.outcome_failed),
    reaction_added: t(($) => $.types.reaction_added),
    quick_create_done: t(($) => $.types.quick_create_done),
    quick_create_failed: t(($) => $.types.quick_create_failed),
  };
}

// start_date / due_date are calendar days — format timezone-safely so the day
// never shifts with the viewer's offset (see @ohmyagentteam/core/issues/date).
function shortDate(dateStr: string): string {
  return formatDateOnly(dateStr, { month: "short", day: "numeric" }, "en-US");
}

export function InboxDetailLabel({ item }: { item: InboxItem }) {
  const { t } = useT("inbox");
  const { t: issueT } = useT("issues");
  const typeLabels = useTypeLabels();
  const { getActorName } = useActorName();
  const details = item.details ?? {};
  const statusLabels: Record<IssueStatus, string> = {
    backlog: issueT(($) => $.status.backlog),
    todo: issueT(($) => $.status.todo),
    in_progress: issueT(($) => $.status.in_progress),
    in_review: issueT(($) => $.status.in_review),
    done: issueT(($) => $.status.done),
    blocked: issueT(($) => $.status.blocked),
    cancelled: issueT(($) => $.status.cancelled),
  };
  const priorityLabels: Record<IssuePriority, string> = {
    urgent: issueT(($) => $.priority.urgent),
    high: issueT(($) => $.priority.high),
    medium: issueT(($) => $.priority.medium),
    low: issueT(($) => $.priority.low),
    none: issueT(($) => $.priority.none),
  };

  switch (item.type) {
    case "status_changed": {
      if (!details.to) return <span>{typeLabels[item.type]}</span>;
      const label = statusLabels[details.to as IssueStatus] ?? details.to;
      return (
        <span className="inline-flex items-center gap-1">
          {t(($) => $.labels.set_status_to)}
          <StatusIcon status={details.to as IssueStatus} className="h-3 w-3" />
          {label}
        </span>
      );
    }
    case "priority_changed": {
      if (!details.to) return <span>{typeLabels[item.type]}</span>;
      const label = priorityLabels[details.to as IssuePriority] ?? details.to;
      return (
        <span className="inline-flex items-center gap-1">
          {t(($) => $.labels.set_priority_to)}
          <PriorityIcon priority={details.to as IssuePriority} className="h-3 w-3" />
          {label}
        </span>
      );
    }
    case "issue_assigned": {
      if (details.new_assignee_id) {
        return <span>{t(($) => $.labels.assigned_to, { name: getActorName(details.new_assignee_type ?? "member", details.new_assignee_id) })}</span>;
      }
      return <span>{typeLabels[item.type]}</span>;
    }
    case "unassigned":
      return <span>{t(($) => $.labels.removed_assignee)}</span>;
    case "assignee_changed": {
      if (details.new_assignee_id) {
        return <span>{t(($) => $.labels.assigned_to, { name: getActorName(details.new_assignee_type ?? "member", details.new_assignee_id) })}</span>;
      }
      return <span>{typeLabels[item.type]}</span>;
    }
    case "start_date_changed": {
      if (details.to) return <span>{t(($) => $.labels.set_start_date_to, { date: shortDate(details.to) })}</span>;
      return <span>{t(($) => $.labels.removed_start_date)}</span>;
    }
    case "due_date_changed": {
      if (details.to) return <span>{t(($) => $.labels.set_due_date_to, { date: shortDate(details.to) })}</span>;
      return <span>{t(($) => $.labels.removed_due_date)}</span>;
    }
    case "new_comment": {
      if (item.body) return <span>{item.body}</span>;
      return <span>{typeLabels[item.type]}</span>;
    }
    case "reaction_added": {
      const emoji = details.emoji;
      if (emoji) return <span>{t(($) => $.labels.reacted_to_comment, { emoji })}</span>;
      return <span>{typeLabels[item.type]}</span>;
    }
    case "quick_create_done": {
      const issueCount = Number(details.issue_count ?? 0);
      if (details.mode === "planning" && issueCount > 0) {
        return <span>{t(($) => $.labels.planned_with_agent, { count: issueCount })}</span>;
      }
      const identifier = details.identifier;
      if (identifier) return <span>{t(($) => $.labels.created_with_agent, { identifier })}</span>;
      return <span>{typeLabels[item.type]}</span>;
    }
    case "quick_create_failed": {
      const detail = getQuickCreateFailureDetail(item);
      if (detail) return <span>{t(($) => $.labels.failed_with_detail, { detail })}</span>;
      return <span>{typeLabels[item.type]}</span>;
    }
    default:
      return <span>{typeLabels[item.type] ?? item.type}</span>;
  }
}
