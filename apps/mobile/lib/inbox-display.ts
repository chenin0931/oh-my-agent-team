/**
 * Inbox title display helpers.
 *
 * Mirrors packages/views/inbox/components/inbox-display.ts. Keeping behavior
 * identical is required by apps/mobile/CLAUDE.md "Behavioral parity":
 * the title a user sees in the mobile inbox MUST match what they see on
 * web for the same item. When the web version changes, sync this file.
 */
import type { InboxItem } from "@ohmyagentteam/core/types";

function singleLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripQuickCreatePrefix(
  title: string,
  identifier?: string,
): string {
  const normalized = singleLine(title);
  if (!normalized) return "";
  if (identifier) {
    const exactPrefix = new RegExp(
      `^Created\\s+${escapeRegExp(identifier)}:\\s*`,
      "i",
    );
    const withoutExactPrefix = normalized.replace(exactPrefix, "");
    if (withoutExactPrefix !== normalized) return withoutExactPrefix.trim();
  }
  return normalized.replace(/^Created\s+[A-Z][A-Z0-9]*-\d+:\s*/i, "").trim();
}

export function getInboxDisplayTitle(item: InboxItem): string {
  const details = item.details ?? {};
  if (item.type === "quick_create_done") {
    const cleanedTitle = stripQuickCreatePrefix(item.title, details.identifier);
    if (cleanedTitle) return cleanedTitle;
    const prompt = singleLine(details.original_prompt);
    if (prompt) return prompt;
  }
  if (item.type === "quick_create_failed") {
    const prompt = singleLine(details.original_prompt);
    if (prompt) return prompt;
  }
  return item.title;
}

/**
 * Deduplicate inbox items by typed target (one entry per Epic or work item).
 *
 * Mirrors packages/core/inbox/queries.ts deduplicateInboxItems. **MUST stay
 * aligned with that function** — see the inbox dedup incident in this file's
 * companion `apps/mobile/CLAUDE.md` "Behavioral parity" section. Skipping
 * this step makes the same workspace/user show different unread counts on
 * mobile vs web.
 *
 * Steps:
 *   1. Drop archived rows (these never appear in web's inbox view).
 *   2. Group by `issue_id` (fall back to `id` for items with no issue
 *      attached — e.g. quick_create_failed).
 *   3. In each group, keep the newest by `created_at`.
 *   4. Preserve the newest grouped `comment_id` anchor when the newest row
 *      is a later status/metadata event for the same issue.
 *   5. Sort the result newest-first.
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
      (item.target_id
        ? `${item.target_type ?? "issue"}:${item.target_id}`
        : null) ??
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
