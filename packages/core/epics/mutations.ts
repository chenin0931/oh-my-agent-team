import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { issueKeys } from "../issues/queries";
import { useRecentIssuesStore } from "../issues/stores";
import { projectKeys } from "../projects/queries";
import type { CreateEpicRequest, UpdateEpicRequest } from "../types";
import { epicKeys } from "./queries";

function useInvalidateEpicWorkspace() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return (epicId?: string) => {
    qc.invalidateQueries({ queryKey: epicKeys.all(wsId) });
    qc.invalidateQueries({ queryKey: projectKeys.all(wsId) });
    qc.invalidateQueries({ queryKey: issueKeys.all(wsId) });
    if (epicId) qc.invalidateQueries({ queryKey: epicKeys.detail(wsId, epicId) });
  };
}

export function useCreateEpic() {
  const invalidate = useInvalidateEpicWorkspace();
  return useMutation({
    mutationFn: (data: CreateEpicRequest) => api.createEpic(data),
    onSuccess: (epic) => invalidate(epic.id),
  });
}

export function useUpdateEpic() {
  const invalidate = useInvalidateEpicWorkspace();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateEpicRequest) =>
      api.updateEpic(id, data),
    onSuccess: (epic) => invalidate(epic.id),
  });
}

export function useDeleteEpic() {
  const invalidate = useInvalidateEpicWorkspace();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteEpic(id),
    onSuccess: (_value, id) => {
      useRecentIssuesStore.getState().forgetIssue(wsId, id);
      invalidate(id);
    },
  });
}

export function useAttachEpicWorkItem() {
  const invalidate = useInvalidateEpicWorkspace();
  return useMutation({
    mutationFn: ({ epicId, issueId }: { epicId: string; issueId: string }) =>
      api.attachEpicWorkItem(epicId, issueId),
    onSuccess: (_item, vars) => invalidate(vars.epicId),
  });
}

export function useDetachEpicWorkItem() {
  const invalidate = useInvalidateEpicWorkspace();
  return useMutation({
    mutationFn: ({ epicId, issueId }: { epicId: string; issueId: string }) =>
      api.detachEpicWorkItem(epicId, issueId),
    onSuccess: (_value, vars) => invalidate(vars.epicId),
  });
}
