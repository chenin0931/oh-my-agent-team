/**
 * Epic planning-container detail. Unlike IssueDetail this screen has no
 * execution state, run history, status transitions, or task controls.
 * Mobile uses native segmented navigation for the same Overview / Work items /
 * Updates information architecture as web and desktop.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Epic,
  EpicHealth,
  EpicLifecycle,
  Issue,
  TimelineEntry,
} from "@ohmyagentteam/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { IssueRow } from "@/components/issue/issue-row";
import { Markdown } from "@/lib/markdown";
import { timeAgo } from "@/lib/time-ago";
import { MOBILE_PLACEHOLDER_COLOR } from "@/components/ui/input-tokens";
import {
  epicDetailOptions,
  epicKeys,
  epicTimelineOptions,
  epicWorkItemsOptions,
} from "@/data/queries/epics";
import {
  useCreateEpicComment,
  useDeleteEpic,
  useDetachEpicWorkItem,
  useRunEpicAdvisor,
  useUpdateEpic,
} from "@/data/mutations/epics";
import { useCreateIssue } from "@/data/mutations/issues";
import { agentListOptions } from "@/data/queries/agents";
import { projectDetailOptions } from "@/data/queries/projects";
import { pinListOptions } from "@/data/queries/pins";
import { useCreatePin, useDeletePin } from "@/data/mutations/pins";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useActorLookup } from "@/data/use-actor-name";
import { useEpicRealtime } from "@/data/realtime/use-epic-realtime";

const LIFECYCLE_LABEL: Record<EpicLifecycle, string> = {
  planned: "Planned",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const HEALTH_LABEL: Record<EpicHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

export default function EpicDetail() {
  const { id, workspace: wsSlug } = useLocalSearchParams<{
    id: string;
    workspace: string;
  }>();
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const [tab, setTab] = useState(0);
  const detail = useQuery(epicDetailOptions(wsId, id));
  const workItems = useQuery(epicWorkItemsOptions(wsId, id));
  const timeline = useQuery(epicTimelineOptions(wsId, id));
  const epic = detail.data;
  const onDeleted = useCallback(() => router.back(), []);
  useEpicRealtime(id, onDeleted);

  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { data: pins } = useQuery(pinListOptions(wsId, userId));
  const isPinned = pins?.some(
    (pin) => pin.item_type === "epic" && pin.item_id === id,
  ) === true;
  const createPin = useCreatePin();
  const deletePin = useDeletePin();
  const deleteEpic = useDeleteEpic();
  const updateEpic = useUpdateEpic(id);

  const onPressMore = useCallback(() => {
    if (!epic) return;
    const options = [
      "Cancel",
      isPinned ? "Unpin" : "Pin",
      "Edit goal",
      "Edit success criteria",
      "Delete Epic",
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        destructiveButtonIndex: 4,
        title: epic.identifier,
      },
      (index) => {
        const action = options[index];
        if (action === "Pin") {
          createPin.mutate({ item_type: "epic", item_id: epic.id });
        } else if (action === "Unpin") {
          deletePin.mutate({ itemType: "epic", itemId: epic.id });
        } else if (action === "Edit goal") {
          Alert.prompt("Epic goal", undefined, (value) => {
            const title = value.trim();
            if (title) updateEpic.mutate({ title });
          }, "plain-text", epic.title);
        } else if (action === "Edit success criteria") {
          Alert.prompt("Success criteria", undefined, (value) => {
            updateEpic.mutate({ success_criteria: value.trim() || null });
          }, "plain-text", epic.success_criteria ?? "");
        } else if (action === "Delete Epic") {
          Alert.alert(
            "Delete Epic?",
            "Its work items will remain in the project and become ungrouped.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  deleteEpic.mutate(epic.id, { onSuccess: () => router.back() }),
              },
            ],
          );
        }
      },
    );
  }, [
    createPin,
    deleteEpic,
    deletePin,
    epic,
    isPinned,
    updateEpic,
  ]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: epic?.identifier ?? "Epic",
          headerBackTitle: "Back",
          headerRight: epic
            ? () => (
                <IconButton
                  name="ellipsis-horizontal"
                  onPress={onPressMore}
                  accessibilityLabel="Epic actions"
                />
              )
            : undefined,
        }}
      />
      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error || !epic?.id ? (
        <LoadError error={detail.error} retry={() => detail.refetch()} />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={88}
        >
          <View className="px-4 py-3 border-b border-border">
            <Text className="text-xs font-medium uppercase text-muted-foreground mb-1">
              Planning container
            </Text>
            <Text className="text-2xl font-semibold text-foreground" selectable>
              {epic.title}
            </Text>
            <View className="mt-3">
              <SegmentedControl
                values={["Overview", "Work items", "Updates"]}
                selectedIndex={tab}
                onChange={(event) =>
                  setTab(event.nativeEvent.selectedSegmentIndex)
                }
              />
            </View>
          </View>
          {tab === 0 ? (
            <Overview epic={epic} />
          ) : tab === 1 ? (
            <WorkItems
              epic={epic}
              items={workItems.data ?? []}
              loading={workItems.isLoading}
              wsSlug={wsSlug}
            />
          ) : (
            <Updates epic={epic} entries={timeline.data ?? []} />
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function Overview({ epic }: { epic: Epic }) {
  const project = useQuery(
    projectDetailOptions(epic.workspace_id, epic.project_id),
  );
  const { getName } = useActorLookup();
  const updateEpic = useUpdateEpic(epic.id);
  const ownerName = epic.owner_type && epic.owner_id
    ? getName(epic.owner_type, epic.owner_id)
    : "Unassigned";

  const chooseLifecycle = () => {
    const values = Object.keys(LIFECYCLE_LABEL) as EpicLifecycle[];
    const options = ["Cancel", ...values.map((value) => LIFECYCLE_LABEL[value])];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0, title: "Lifecycle" },
      (index) => {
        const value = values[index - 1];
        if (value) updateEpic.mutate({ lifecycle: value });
      },
    );
  };

  const chooseHealth = () => {
    const values: (EpicHealth | null)[] = [null, "on_track", "at_risk", "off_track"];
    const options = ["Cancel", "Not set", "On track", "At risk", "Off track"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0, title: "Health" },
      (index) => {
        if (index > 0) updateEpic.mutate({ health: values[index - 1] });
      },
    );
  };

  return (
    <ScrollView contentContainerClassName="px-4 py-4 gap-4 pb-10">
      <Card className="gap-3">
        <SectionLabel>Goal and scope</SectionLabel>
        {epic.description ? (
          <Markdown content={epic.description} attachments={epic.attachments} />
        ) : (
          <Text className="text-sm text-muted-foreground italic">
            No scope has been documented.
          </Text>
        )}
      </Card>
      <Card className="gap-3">
        <SectionLabel>Success criteria</SectionLabel>
        {epic.success_criteria ? (
          <Markdown content={epic.success_criteria} attachments={epic.attachments} />
        ) : (
          <Text className="text-sm text-muted-foreground italic">
            No success criteria yet.
          </Text>
        )}
      </Card>
      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <SectionLabel>Delivery progress</SectionLabel>
          <Text className="text-sm font-semibold text-foreground">
            {epic.completion_percent}%
          </Text>
        </View>
        <View className="h-2 rounded-full bg-secondary overflow-hidden">
          <View
            className="h-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, epic.completion_percent))}%` }}
          />
        </View>
        <View className="flex-row gap-4">
          <Metric label="Done" value={epic.done_issues} />
          <Metric label="Total" value={epic.total_issues} />
          <Metric label="Blocked" value={epic.blocked_issues} />
        </View>
      </Card>
      <View className="border-y border-border">
        <PropertyRow
          label="Lifecycle"
          value={LIFECYCLE_LABEL[epic.lifecycle] ?? epic.lifecycle}
          onPress={chooseLifecycle}
        />
        <PropertyRow
          label="Health"
          value={epic.health ? HEALTH_LABEL[epic.health] : "Not set"}
          onPress={chooseHealth}
        />
        <PropertyRow label="Project" value={project.data?.title ?? "Project"} />
        <PropertyRow
          label="Owner"
          value={ownerName}
          leading={
            epic.owner_type && epic.owner_id ? (
              <ActorAvatar type={epic.owner_type} id={epic.owner_id} size={20} />
            ) : undefined
          }
        />
        <PropertyRow
          label="Priority"
          value={epic.priority}
          leading={<PriorityIcon priority={epic.priority} size={16} />}
        />
        <PropertyRow label="Start" value={epic.start_date ?? "Not set"} />
        <PropertyRow label="Target" value={epic.target_date ?? "Not set"} />
      </View>
      {epic.health === "at_risk" || epic.health === "off_track" || epic.blocked_issues > 0 ? (
        <Card className="border-warning/50 bg-warning/5 gap-2">
          <SectionLabel>Recent risk</SectionLabel>
          <Text className="text-sm text-foreground">
            {epic.blocked_issues > 0
              ? `${epic.blocked_issues} direct work item${epic.blocked_issues === 1 ? " is" : "s are"} blocked.`
              : "The Epic health needs planning attention."}
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function WorkItems({
  epic,
  items,
  loading,
  wsSlug,
}: {
  epic: Epic;
  items: Issue[];
  loading: boolean;
  wsSlug: string;
}) {
  const queryClient = useQueryClient();
  const createIssue = useCreateIssue();
  const detach = useDetachEpicWorkItem(epic.id);
  const direct = useMemo(
    () => items.filter((item) => item.issue_type !== "subtask"),
    [items],
  );
  const children = useMemo(() => {
    const result = new Map<string, Issue[]>();
    for (const item of items) {
      if (item.issue_type !== "subtask" || !item.parent_issue_id) continue;
      const group = result.get(item.parent_issue_id) ?? [];
      group.push(item);
      result.set(item.parent_issue_id, group);
    }
    return result;
  }, [items]);

  const createWorkItem = () => {
    Alert.prompt("New backlog work item", "This creates an Issue inside the Epic.", (value) => {
      const title = value.trim();
      if (!title) return;
      createIssue.mutate(
        {
          title,
          status: "backlog",
          issue_type: "issue",
          project_id: epic.project_id,
          epic_id: epic.id,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: epicKeys.workItems(epic.workspace_id, epic.id),
            });
            queryClient.invalidateQueries({
              queryKey: epicKeys.detail(epic.workspace_id, epic.id),
            });
          },
          onError: (error) =>
            Alert.alert("Failed to create work item", error.message),
        },
      );
    });
  };

  const workItemMenu = (issue: Issue) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Open work item", "Remove from Epic"],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 2,
        title: issue.identifier,
      },
      (index) => {
        if (index === 1) router.push(`/${wsSlug}/issue/${issue.id}`);
        if (index === 2) detach.mutate(issue.id);
      },
    );
  };

  return (
    <ScrollView contentContainerClassName="py-3 pb-10">
      <View className="px-4 pb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-medium text-foreground">Direct work items</Text>
          <Text className="text-xs text-muted-foreground">
            Execution begins only after an Issue leaves Backlog.
          </Text>
        </View>
        <Button size="sm" onPress={createWorkItem} disabled={createIssue.isPending}>
          <Ionicons name="add" size={16} />
          <Text>Add</Text>
        </Button>
      </View>
      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : direct.length === 0 ? (
        <View className="px-4 py-10 items-center">
          <Text className="text-sm text-muted-foreground">
            No work items in this Epic.
          </Text>
        </View>
      ) : (
        direct.map((issue) => (
          <View key={issue.id} className="border-t border-border">
            <Pressable onLongPress={() => workItemMenu(issue)}>
              <IssueRow
                issue={issue}
                showStatus
                onPress={() => router.push(`/${wsSlug}/issue/${issue.id}`)}
              />
            </Pressable>
            {(children.get(issue.id) ?? []).map((subtask) => (
              <View key={subtask.id} className="pl-8 border-t border-border/60">
                <IssueRow
                  issue={subtask}
                  showStatus
                  onPress={() => router.push(`/${wsSlug}/issue/${subtask.id}`)}
                />
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Updates({ epic, entries }: { epic: Epic; entries: TimelineEntry[] }) {
  const [comment, setComment] = useState("");
  const createComment = useCreateEpicComment(epic.id);
  const advisor = useRunEpicAdvisor(epic.id);
  const { data: agents = [] } = useQuery(agentListOptions(epic.workspace_id));

  const askAdvisor = () => {
    if (agents.length === 0) {
      Alert.alert("No Agent available", "Connect an Agent before requesting planning advice.");
      return;
    }
    const options = ["Cancel", ...agents.map((agent) => agent.name)];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0, title: "Choose a planning advisor" },
      (index) => {
        const agent = agents[index - 1];
        if (!agent) return;
        Alert.prompt(
          `Ask ${agent.name}`,
          "The Agent can read this Epic and leave one suggestion. It cannot edit or execute work.",
          (value) => {
            advisor.mutate(
              { agent_id: agent.id, prompt: value.trim() || undefined },
              {
                onSuccess: () => Alert.alert("Advisor queued"),
                onError: (error) => Alert.alert("Advisor failed", error.message),
              },
            );
          },
          "plain-text",
        );
      },
    );
  };

  const submit = () => {
    const content = comment.trim();
    if (!content) return;
    createComment.mutate(content, {
      onSuccess: () => setComment(""),
      onError: (error) => Alert.alert("Comment failed", error.message),
    });
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-4 py-4 gap-3 pb-6">
        <Button variant="outline" onPress={askAdvisor} disabled={advisor.isPending}>
          <Ionicons name="sparkles-outline" size={17} />
          <Text>Ask an Agent to analyze</Text>
        </Button>
        {entries.length === 0 ? (
          <Text className="text-sm text-muted-foreground text-center py-10">
            No planning updates yet.
          </Text>
        ) : (
          entries.map((entry) => <EpicTimelineRow key={entry.id} entry={entry} />)
        )}
      </ScrollView>
      <View className="border-t border-border px-3 py-2 flex-row items-end gap-2 bg-background">
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Leave a planning update"
          placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
          multiline
          className="flex-1 min-h-10 max-h-28 rounded-md bg-secondary px-3 py-2 text-sm text-foreground"
        />
        <Button size="icon" onPress={submit} disabled={!comment.trim() || createComment.isPending}>
          <Ionicons name="arrow-up" size={18} />
        </Button>
      </View>
    </View>
  );
}

function EpicTimelineRow({ entry }: { entry: TimelineEntry }) {
  const { getName } = useActorLookup();
  const actor = getName(
    entry.actor_type as "member" | "agent" | null,
    entry.actor_id,
  );
  if (entry.type === "comment") {
    return (
      <Card className="gap-3">
        <View className="flex-row items-center gap-2">
          <ActorAvatar
            type={entry.actor_type as "member" | "agent" | "system"}
            id={entry.actor_id}
            size={24}
          />
          <Text className="text-sm font-medium text-foreground flex-1">{actor}</Text>
          <Text className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</Text>
        </View>
        {entry.content ? <Markdown content={entry.content} attachments={entry.attachments} /> : null}
      </Card>
    );
  }
  const details = entry.details ?? {};
  const from = typeof details.from === "string" ? details.from : null;
  const to = typeof details.to === "string" ? details.to : null;
  const action = (entry.action ?? "updated").replaceAll("_", " ");
  return (
    <View className="flex-row items-start gap-2 py-1">
      <ActorAvatar
        type={entry.actor_type as "member" | "agent" | "system"}
        id={entry.actor_id}
        size={18}
      />
      <Text className="text-xs text-muted-foreground flex-1">
        <Text className="text-xs font-medium text-muted-foreground">{actor}</Text>
        {` ${action}${from || to ? ` ${from ?? ""}${from && to ? " to " : ""}${to ?? ""}` : ""}`}
      </Text>
      <Text className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</Text>
    </View>
  );
}

function PropertyRow({
  label,
  value,
  leading,
  onPress,
}: {
  label: string;
  value: string;
  leading?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center px-4 py-3 border-b border-border active:bg-secondary"
    >
      <Text className="text-sm text-muted-foreground w-24">{label}</Text>
      <View className="flex-1 flex-row items-center gap-2">
        {leading}
        <Text className="text-sm text-foreground capitalize">{value}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={14} /> : null}
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1">
      <Text className="text-xl font-semibold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-xs font-medium uppercase text-muted-foreground">
      {children}
    </Text>
  );
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6 gap-3">
      <Text className="text-sm text-destructive text-center">
        Failed to load Epic: {error instanceof Error ? error.message : "not found"}
      </Text>
      <Button variant="outline" onPress={retry}>
        <Text>Retry</Text>
      </Button>
    </View>
  );
}
