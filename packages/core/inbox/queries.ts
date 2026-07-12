import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { InboxItem, InboxWorkspaceUnread } from "../types";

export const inboxKeys = {
  all: (wsId: string) => ["inbox", wsId] as const,
  list: (wsId: string) => [...inboxKeys.all(wsId), "list"] as const,
  // Account-level (not workspace-scoped): a single shared cache entry that
  // holds unread counts for every workspace the user belongs to.
  unreadSummary: () => ["inbox", "unread-summary"] as const,
};

export function inboxListOptions(wsId: string) {
  return queryOptions({
    queryKey: inboxKeys.list(wsId),
    queryFn: () => api.listInbox(),
  });
}

/**
 * Cross-workspace unread inbox summary. One cache entry shared across all
 * workspaces — the data is account-level, so switching workspaces does not
 * refetch it; only the derived "is this for another workspace" view changes.
 */
export function inboxUnreadSummaryOptions() {
  return queryOptions({
    queryKey: inboxKeys.unreadSummary(),
    queryFn: () => api.getInboxUnreadSummary(),
  });
}

/**
 * Whether any workspace OTHER than `currentWsId` has unread inbox items.
 * Drives the workspace-switcher dot: the active workspace's own unread is
 * already surfaced by the Inbox nav count, so it is excluded here to avoid a
 * duplicate signal.
 */
export function hasOtherWorkspaceUnread(
  summary: InboxWorkspaceUnread[],
  currentWsId: string | null | undefined,
): boolean {
  return summary.some((s) => s.workspace_id !== currentWsId && s.count > 0);
}

/**
 * Set of workspace ids that have unread inbox items. Lets the workspace
 * switcher dropdown mark WHICH workspace a pending message lives in (the
 * aggregate switcher dot only says "somewhere else"). Workspaces with a zero
 * count are excluded.
 */
export function unreadWorkspaceIds(summary: InboxWorkspaceUnread[]): Set<string> {
  return new Set(summary.filter((s) => s.count > 0).map((s) => s.workspace_id));
}

/**
 * Unread inbox count for the given workspace, aligned with what the inbox
 * list UI renders: archived items excluded, then deduplicated by issue so a
 * single issue with three unread notifications counts once. An unread action
 * remains surfaced until the user opens it, even when a newer informational
 * Agent comment arrives for the same issue.
 */
export function useInboxUnreadCount(wsId: string | null | undefined): number {
  const { data } = useQuery({
    queryKey: inboxKeys.list(wsId ?? ""),
    queryFn: () => api.listInbox(),
    enabled: !!wsId,
    select: (items: InboxItem[]) =>
      deduplicateInboxItems(items).filter((i) => !i.read).length,
  });
  return data ?? 0;
}

/**
 * Deduplicate inbox items by typed target (one entry per Epic or work item).
 * Unread action-required items take precedence over newer informational
 * updates. This keeps a human assignment visible while advisor comments are
 * arriving; after the action is opened, the newest update becomes the row.
 * Exported for consumers to use in useMemo — not in queryOptions select.
 */
export function deduplicateInboxItems(items: InboxItem[]): InboxItem[] {
  const active = items.filter((i) => !i.archived);
  const quickCreateIssueKeys = new Map<
    string,
    { issueId: string; createdAt: number }
  >();
  for (const item of active) {
    const targetId = item.target_id ?? item.issue_id;
    if (item.type !== "quick_create_done" || !targetId) continue;
    const prompt = item.details?.original_prompt?.replace(/\s+/g, " ").trim();
    if (!prompt) continue;
    const quickKey = `quick-create:${item.details?.agent_id ?? item.actor_id ?? ""}:${prompt}`;
    const createdAt = new Date(item.created_at).getTime();
    const existing = quickCreateIssueKeys.get(quickKey);
    if (!existing || createdAt > existing.createdAt) {
      quickCreateIssueKeys.set(quickKey, { issueId: targetId, createdAt });
    }
  }

  const groups = new Map<string, InboxItem[]>();
  for (const item of active) {
    const prompt = item.details?.original_prompt?.replace(/\s+/g, " ").trim();
    const isQuickCreateResult =
      item.type === "quick_create_done" || item.type === "quick_create_failed";
    const quickKey =
      isQuickCreateResult && prompt
        ? `quick-create:${item.details?.agent_id ?? item.actor_id ?? ""}:${prompt}`
        : null;
    const key =
      (quickKey && quickCreateIssueKeys.get(quickKey)?.issueId) ??
      (item.target_id ? `${item.target_type ?? "issue"}:${item.target_id}` : null) ??
      item.issue_id ??
      quickKey ??
      item.id;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const merged: InboxItem[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const newest = group[0];
    if (!newest) continue;
    // A successful retry resolves an earlier quick-create failure. Surface the
    // latest attempt for that same agent + prompt instead of pinning the stale
    // action-required row forever. Other issue actions retain precedence so a
    // human assignment cannot be displaced by advisor chatter.
    const newestQuickCreateResult = group.find(
      (item) =>
        item.type === "quick_create_done" || item.type === "quick_create_failed",
    );
    const actionCandidates =
      newestQuickCreateResult?.type === "quick_create_done"
        ? group.filter((item) => item.type !== "quick_create_failed")
        : group;
    const surfaced =
      actionCandidates.find(
        (item) => !item.read && item.severity === "action_required",
      ) ?? newest;

    const commentId =
      surfaced.details?.comment_id ??
      (surfaced.severity === "action_required"
        ? undefined
        : group.find((item) => item.details?.comment_id)?.details?.comment_id);

    if (commentId && surfaced.details?.comment_id !== commentId) {
      merged.push({
        ...surfaced,
        details: { ...(surfaced.details ?? {}), comment_id: commentId },
      });
      continue;
    }

    merged.push(surfaced);
  }
  return merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
