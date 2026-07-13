"use client";

import { Check, FlagTriangleRight, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { epicListOptions } from "@ohmyagentteam/core/epics/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ohmyagentteam/ui/components/ui/dropdown-menu";
import { useT } from "../../i18n";

export function EpicPicker({
  projectId,
  epicId,
  onChange,
  triggerRender,
  align = "start",
}: {
  projectId: string;
  epicId: string | null;
  onChange: (epicId: string | null) => void;
  triggerRender?: React.ReactElement;
  align?: "start" | "center" | "end";
}) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const { data: allEpics = [], isLoading } = useQuery({
    ...epicListOptions(wsId, projectId),
    enabled: !!projectId,
  });
  const epics = allEpics.filter(
    (epic) =>
      epic.lifecycle !== "completed" && epic.lifecycle !== "cancelled",
  );
  const current = allEpics.find((epic) => epic.id === epicId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          triggerRender
            ? undefined
            : "flex cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1 -mx-1 transition-colors hover:bg-accent/30"
        }
        render={triggerRender}
      >
        <FlagTriangleRight className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {current?.title ??
            (isLoading
              ? t(($) => $.epic.picker_loading)
              : t(($) => $.epic.picker_none))}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        {epics.map((epic) => (
          <DropdownMenuItem key={epic.id} onClick={() => onChange(epic.id)}>
            <FlagTriangleRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{epic.title}</span>
            {epic.id === epicId && (
              <Check className="ml-auto size-3.5 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        {epics.length > 0 && epicId && <DropdownMenuSeparator />}
        {epicId && (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <X className="size-3.5 text-muted-foreground" />
            {t(($) => $.epic.picker_remove)}
          </DropdownMenuItem>
        )}
        {epics.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {isLoading
              ? t(($) => $.epic.picker_loading)
              : t(($) => $.epic.picker_empty)}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
