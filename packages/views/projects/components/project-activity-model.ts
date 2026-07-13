import type { ProjectActivityItem } from "@ohmyagentteam/core/types";

export function deduplicateProjectActivity(items: ProjectActivityItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const signature = [
      item.target_type,
      item.target_id,
      item.actor_type ?? "",
      item.actor_id ?? "",
      item.action,
      item.body ?? "",
    ].join("\u0000");

    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
