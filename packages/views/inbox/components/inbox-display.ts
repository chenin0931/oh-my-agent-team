import type { InboxItem } from "@ohmyagentteam/core/types";
import { formatAgentError } from "../../common/agent-error";

function singleLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripQuickCreatePrefix(title: string, identifier?: string): string {
  const normalized = singleLine(title);
  if (!normalized) return "";

  if (identifier) {
    const exactPrefix = new RegExp(
      `^(Created|Planned)\\s+${escapeRegExp(identifier)}:\\s*`,
      "i",
    );
    const withoutExactPrefix = normalized.replace(exactPrefix, "");
    if (withoutExactPrefix !== normalized) return withoutExactPrefix.trim();
  }

  return normalized
    .replace(/^(Created|Planned)\s+[A-Z][A-Z0-9]*-\d+:\s*/i, "")
    .trim();
}

export function getInboxDisplayTitle(item: InboxItem): string {
  const details = item.details ?? {};

  if (item.type === "quick_create_done") {
    const prompt = singleLine(details.original_prompt);
    if (details.mode === "planning" && Number(details.issue_count ?? 0) > 1 && prompt) {
      return prompt;
    }

    const cleanedTitle = stripQuickCreatePrefix(item.title, details.identifier);
    if (cleanedTitle) return cleanedTitle;

    if (prompt) return prompt;
  }

  if (item.type === "quick_create_failed") {
    const prompt = singleLine(details.original_prompt);
    if (prompt) return prompt;
  }

  return item.title;
}

export function getQuickCreateFailureDetail(item: InboxItem): string {
  const details = item.details ?? {};
  return formatAgentError(details.error) || formatAgentError(item.body);
}
