import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EpicDetail } from "@ohmyagentteam/views/epics/components";
import { epicDetailOptions } from "@ohmyagentteam/core/epics/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function EpicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wsId = useWorkspaceId();
  const { data: epic } = useQuery({
    ...epicDetailOptions(wsId, id ?? ""),
    enabled: Boolean(id),
  });
  useDocumentTitle(epic ? `${epic.identifier}: ${epic.title}` : "Epic");
  return id ? <EpicDetail epicId={id} /> : null;
}
