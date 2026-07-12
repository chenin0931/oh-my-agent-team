/** Per-Epic realtime updates. Epic events only touch the independent Epic
 * cache tree; issue events refresh child work items when their epic changes. */
import { useQueryClient } from "@tanstack/react-query";
import type { Epic, Issue } from "@ohmyagentteam/core/types";
import { epicKeys } from "@/data/queries/epics";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";

export function useEpicRealtime(
  epicId: string | undefined,
  onDeleted?: () => void,
) {
  const queryClient = useQueryClient();

  useWSSubscriptions(
    (ws, wsId) => {
      if (!epicId) return;
      const detailKey = epicKeys.detail(wsId, epicId);
      const workItemsKey = epicKeys.workItems(wsId, epicId);
      const timelineKey = epicKeys.timeline(wsId, epicId);
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: detailKey });
        queryClient.invalidateQueries({ queryKey: workItemsKey });
        queryClient.invalidateQueries({ queryKey: timelineKey });
      };

      return [
        ws.on("epic:updated", (payload) => {
          if (payload.epic.id !== epicId) return;
          queryClient.setQueryData<Epic>(detailKey, payload.epic);
          queryClient.invalidateQueries({ queryKey: epicKeys.list(wsId) });
        }),
        ws.on("epic:deleted", (payload) => {
          if (payload.epic_id !== epicId) return;
          queryClient.removeQueries({ queryKey: detailKey });
          queryClient.removeQueries({ queryKey: workItemsKey });
          queryClient.removeQueries({ queryKey: timelineKey });
          onDeleted?.();
        }),
        ws.on("issue:created", (payload) => {
          if (payload.issue.epic_id === epicId) invalidate();
        }),
        ws.on("issue:updated", (payload) => {
          const cached = queryClient.getQueryData<Issue[]>(workItemsKey) ?? [];
          if (
            payload.issue.epic_id === epicId ||
            cached.some((item) => item.id === payload.issue.id)
          ) {
            invalidate();
          }
        }),
        ws.on("issue:deleted", (payload) => {
          const cached = queryClient.getQueryData<Issue[]>(workItemsKey) ?? [];
          if (cached.some((item) => item.id === payload.issue_id)) invalidate();
        }),
        ws.on("comment:created", (payload) => {
          if (payload.comment.issue_id === epicId) {
            queryClient.invalidateQueries({ queryKey: timelineKey });
          }
        }),
        ws.on("comment:updated", (payload) => {
          if (payload.comment.issue_id === epicId) {
            queryClient.invalidateQueries({ queryKey: timelineKey });
          }
        }),
        ws.on("comment:deleted", (payload) => {
          if (payload.issue_id === epicId) {
            queryClient.invalidateQueries({ queryKey: timelineKey });
          }
        }),
        ws.on("activity:created", (payload) => {
          if (payload.issue_id === epicId) {
            queryClient.invalidateQueries({ queryKey: timelineKey });
          }
        }),
        ws.onReconnect(invalidate),
      ];
    },
    [epicId, queryClient, onDeleted],
  );
}
