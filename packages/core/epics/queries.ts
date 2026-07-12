import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const epicKeys = {
  all: (wsId: string) => ["epics", wsId] as const,
  list: (wsId: string) => [...epicKeys.all(wsId), "list"] as const,
  listByProject: (wsId: string, projectId: string) =>
    [...epicKeys.list(wsId), { projectId }] as const,
  detail: (wsId: string, id: string) =>
    [...epicKeys.all(wsId), "detail", id] as const,
  workItems: (wsId: string, id: string) =>
    [...epicKeys.all(wsId), "work-items", id] as const,
  timeline: (wsId: string, id: string) =>
    [...epicKeys.all(wsId), "timeline", id] as const,
  subscribers: (wsId: string, id: string) =>
    [...epicKeys.all(wsId), "subscribers", id] as const,
  attachments: (wsId: string, id: string) =>
    [...epicKeys.all(wsId), "attachments", id] as const,
};

export function epicListOptions(wsId: string, projectId?: string) {
  return queryOptions({
    queryKey: projectId
      ? epicKeys.listByProject(wsId, projectId)
      : epicKeys.list(wsId),
    queryFn: () => api.listEpics({ project_id: projectId, limit: 100 }),
    select: (data) => data.epics,
  });
}

export function epicDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: epicKeys.detail(wsId, id),
    queryFn: () => api.getEpic(id),
  });
}

export function epicWorkItemsOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: epicKeys.workItems(wsId, id),
    queryFn: () => api.listEpicWorkItems(id),
    select: (data) => data.issues,
  });
}

export function epicTimelineOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: epicKeys.timeline(wsId, id),
    queryFn: () => api.listEpicTimeline(id),
  });
}

export function epicSubscribersOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: epicKeys.subscribers(wsId, id),
    queryFn: () => api.listEpicSubscribers(id),
  });
}

export function epicAttachmentsOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: epicKeys.attachments(wsId, id),
    queryFn: () => api.listEpicAttachments(id),
  });
}
