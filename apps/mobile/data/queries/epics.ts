/** Mobile-owned Epic queries. Epics are planning containers and deliberately
 * live outside the executable issue cache tree. */
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const epicKeys = {
  all: (wsId: string | null) => ["epics", wsId] as const,
  list: (wsId: string | null, projectId?: string) =>
    [...epicKeys.all(wsId), "list", projectId ?? "all"] as const,
  detail: (wsId: string | null, id: string) =>
    [...epicKeys.all(wsId), "detail", id] as const,
  workItems: (wsId: string | null, id: string) =>
    [...epicKeys.detail(wsId, id), "work-items"] as const,
  timeline: (wsId: string | null, id: string) =>
    [...epicKeys.detail(wsId, id), "timeline"] as const,
};

export const epicListOptions = (
  wsId: string | null,
  projectId?: string,
) =>
  queryOptions({
    queryKey: epicKeys.list(wsId, projectId),
    queryFn: async ({ signal }) => {
      const response = await api.listEpics(
        projectId ? { project_id: projectId } : {},
        { signal },
      );
      return response.epics;
    },
    enabled: !!wsId,
  });

export const epicDetailOptions = (wsId: string | null, id: string) =>
  queryOptions({
    queryKey: epicKeys.detail(wsId, id),
    queryFn: ({ signal }) => api.getEpic(id, { signal }),
    enabled: !!wsId && !!id,
  });

export const epicWorkItemsOptions = (wsId: string | null, id: string) =>
  queryOptions({
    queryKey: epicKeys.workItems(wsId, id),
    queryFn: async ({ signal }) => {
      const response = await api.listEpicWorkItems(id, { signal });
      return response.issues;
    },
    enabled: !!wsId && !!id,
  });

export const epicTimelineOptions = (wsId: string | null, id: string) =>
  queryOptions({
    queryKey: epicKeys.timeline(wsId, id),
    queryFn: ({ signal }) => api.listEpicTimeline(id, { signal }),
    enabled: !!wsId && !!id,
  });
