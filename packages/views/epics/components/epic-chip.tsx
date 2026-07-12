"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers3 } from "lucide-react";
import { epicDetailOptions } from "@ohmyagentteam/core/epics/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";

export interface EpicChipProps {
  epicId: string;
  fallbackLabel?: string;
  className?: string;
}

const BASE_CLASS =
  "epic-mention inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border mx-0.5 px-2 py-0.5 text-xs";

/** Compact, presentation-only representation of an Epic planning container. */
export function EpicChip({ epicId, fallbackLabel, className }: EpicChipProps) {
  const wsId = useWorkspaceId();
  const { data: epic } = useQuery(epicDetailOptions(wsId, epicId));
  const cls = className ? `${BASE_CLASS} ${className}` : BASE_CLASS;

  return (
    <span className={cls}>
      <Layers3 className="size-3.5 shrink-0 text-muted-foreground" />
      {epic?.id ? (
        <>
          <span className="shrink-0 font-medium text-muted-foreground">
            {epic.identifier}
          </span>
          <span className="min-w-0 truncate text-foreground">{epic.title}</span>
        </>
      ) : (
        <span className="min-w-0 truncate font-medium text-muted-foreground">
          {fallbackLabel ?? epicId.slice(0, 8)}
        </span>
      )}
    </span>
  );
}
