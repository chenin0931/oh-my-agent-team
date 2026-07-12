"use client";

import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { AppLink } from "../../navigation";
import { EpicChip } from "./epic-chip";

export function EpicMentionCard({
  epicId,
  fallbackLabel,
}: {
  epicId: string;
  fallbackLabel?: string;
}) {
  const paths = useWorkspacePaths();
  return (
    <AppLink
      href={paths.epicDetail(epicId)}
      className="epic-mention not-prose align-middle"
    >
      <EpicChip
        epicId={epicId}
        fallbackLabel={fallbackLabel}
        className="cursor-pointer transition-colors hover:bg-accent"
      />
    </AppLink>
  );
}
