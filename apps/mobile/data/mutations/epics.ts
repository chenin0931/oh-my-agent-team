import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateEpicRequest, UpdateEpicRequest } from "@ohmyagentteam/core/types";
import { api } from "@/data/api";
import { epicKeys } from "@/data/queries/epics";
import { issueKeys } from "@/data/queries/issues";
import { useWorkspaceStore } from "@/data/workspace-store";

export function useUpdateEpic(id: string) {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (data: UpdateEpicRequest) => api.updateEpic(id, data),
    onSuccess: (epic) => {
      queryClient.setQueryData(epicKeys.detail(wsId, id), epic);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.all(wsId) });
    },
  });
}

export function useCreateEpic() {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (data: CreateEpicRequest) => api.createEpic(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.all(wsId) });
    },
  });
}

export function useDeleteEpic() {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (id: string) => api.deleteEpic(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.all(wsId) });
    },
  });
}

export function useCreateEpicComment(id: string) {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (content: string) => api.createEpicComment(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.timeline(wsId, id) });
    },
  });
}

export function useRunEpicAdvisor(id: string) {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (data: { agent_id: string; prompt?: string }) =>
      api.runEpicAdvisor(id, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.timeline(wsId, id) });
    },
  });
}

export function useDetachEpicWorkItem(epicId: string) {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return useMutation({
    mutationFn: (issueId: string) => api.detachEpicWorkItem(epicId, issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: epicKeys.workItems(wsId, epicId),
      });
      queryClient.invalidateQueries({ queryKey: epicKeys.detail(wsId, epicId) });
      queryClient.invalidateQueries({ queryKey: issueKeys.list(wsId) });
    },
  });
}
