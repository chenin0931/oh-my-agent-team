/** Project-scoped planning containers. Kept separate from executable work
 * items so an Epic never appears in the status-grouped Issue list. */
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { epicListOptions } from "@/data/queries/epics";
import { useCreateEpic } from "@/data/mutations/epics";
import { useWorkspaceStore } from "@/data/workspace-store";

export function ProjectEpics({ projectId }: { projectId: string }) {
  const wsId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((state) => state.currentWorkspaceSlug);
  const epics = useQuery(epicListOptions(wsId, projectId));
  const createEpic = useCreateEpic();

  const create = () => {
    Alert.prompt("New Epic", "Describe the business outcome this Epic contains.", (value) => {
      const title = value.trim();
      if (!title) return;
      createEpic.mutate(
        { title, project_id: projectId },
        {
          onSuccess: (epic) => {
            if (wsSlug) router.push(`/${wsSlug}/epic/${epic.id}`);
          },
          onError: (error) => Alert.alert("Failed to create Epic", error.message),
        },
      );
    });
  };

  return (
    <View className="border-y border-border">
      <View className="px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-medium text-foreground">Epics</Text>
          <Text className="text-xs text-muted-foreground">Planning containers for shared outcomes</Text>
        </View>
        <Button variant="outline" size="sm" onPress={create} disabled={createEpic.isPending}>
          <Ionicons name="add" size={15} />
          <Text>New</Text>
        </Button>
      </View>
      {(epics.data ?? []).length === 0 ? (
        <Text className="px-4 pb-4 text-sm text-muted-foreground">
          No Epics in this project.
        </Text>
      ) : (
        (epics.data ?? []).map((epic) => (
          <Pressable
            key={epic.id}
            onPress={() => {
              if (wsSlug) router.push(`/${wsSlug}/epic/${epic.id}`);
            }}
            className="px-4 py-3 border-t border-border flex-row items-center gap-3 active:bg-secondary"
          >
            <Ionicons name="layers-outline" size={18} />
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">
                {epic.identifier} · {epic.completion_percent}% complete
              </Text>
              <Text className="text-sm text-foreground" numberOfLines={1}>
                {epic.title}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground capitalize">
              {epic.lifecycle.replaceAll("_", " ")}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
