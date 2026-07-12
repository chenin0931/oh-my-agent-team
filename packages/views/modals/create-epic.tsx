"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EpicHealth, EpicOwnerType, IssuePriority } from "@ohmyagentteam/core/types";
import { useCreateEpic } from "@ohmyagentteam/core/epics/mutations";
import { projectListOptions } from "@ohmyagentteam/core/projects/queries";
import { agentListOptions, memberListOptions } from "@ohmyagentteam/core/workspace/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ohmyagentteam/ui/components/ui/dialog";
import { Input } from "@ohmyagentteam/ui/components/ui/input";
import { Label } from "@ohmyagentteam/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@ohmyagentteam/ui/components/ui/native-select";
import { Textarea } from "@ohmyagentteam/ui/components/ui/textarea";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";

const priorities: IssuePriority[] = ["urgent", "high", "medium", "low", "none"];
const healthValues: EpicHealth[] = ["on_track", "at_risk", "off_track"];

export function CreateEpicModal({
  onClose,
  data,
}: {
  onClose: () => void;
  data?: Record<string, unknown> | null;
}) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const createEpic = useCreateEpic();

  const seededProjectId = typeof data?.project_id === "string" ? data.project_id : "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [projectId, setProjectId] = useState(seededProjectId);
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("none");
  const [health, setHealth] = useState<EpicHealth | "">("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const activeAgents = useMemo(() => agents.filter((agent) => !agent.archived_at), [agents]);
  const canSubmit = title.trim().length > 0 && projectId.length > 0 && !createEpic.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    const [ownerType, ownerId] = owner.split(":") as [EpicOwnerType | "", string | undefined];
    try {
      const epic = await createEpic.mutateAsync({
        title: title.trim(),
        project_id: projectId,
        description: description.trim() || null,
        success_criteria: successCriteria.trim() || null,
        health: health || null,
        priority,
        owner_type: ownerType || null,
        owner_id: ownerId || null,
        start_date: startDate || null,
        target_date: targetDate || null,
      });
      toast.success(t(($) => $.epic.created));
      onClose();
      navigation.push(paths.epicDetail(epic.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.epic.create_failed));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md border bg-muted/40">
              <Layers3 className="size-4" />
            </span>
            <div>
              <DialogTitle className="font-serif">{t(($) => $.epic.create_title)}</DialogTitle>
              <DialogDescription className="mt-1">{t(($) => $.epic.create_description)}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="epic-title">{t(($) => $.epic.title)}</Label>
            <Input
              id="epic-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
              }}
              placeholder={t(($) => $.epic.title_placeholder)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="epic-description">{t(($) => $.epic.description)}</Label>
            <Textarea
              id="epic-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t(($) => $.epic.description_placeholder)}
              className="min-h-24 resize-y"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="epic-success">{t(($) => $.epic.success_criteria)}</Label>
            <Textarea
              id="epic-success"
              value={successCriteria}
              onChange={(event) => setSuccessCriteria(event.target.value)}
              placeholder={t(($) => $.epic.success_placeholder)}
              className="min-h-20 resize-y"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t(($) => $.epic.project)}>
              <NativeSelect className="w-full" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <NativeSelectOption value="" disabled>{t(($) => $.epic.project)}</NativeSelectOption>
                {projects.map((project) => (
                  <NativeSelectOption key={project.id} value={project.id}>{project.title}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t(($) => $.epic.owner)}>
              <NativeSelect className="w-full" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <NativeSelectOption value="">{t(($) => $.epic.unassigned)}</NativeSelectOption>
                <NativeSelectOptGroup label={t(($) => $.lead.members_group)}>
                  {members.map((member) => (
                    <NativeSelectOption key={member.user_id} value={`member:${member.user_id}`}>{member.name}</NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
                <NativeSelectOptGroup label={t(($) => $.lead.agents_group)}>
                  {activeAgents.map((agent) => (
                    <NativeSelectOption key={agent.id} value={`agent:${agent.id}`}>{agent.name}</NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              </NativeSelect>
            </Field>
            <Field label={t(($) => $.epic.priority)}>
              <NativeSelect className="w-full" value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>
                {priorities.map((value) => (
                  <NativeSelectOption key={value} value={value}>{t(($) => $.priority[value])}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t(($) => $.epic.health)}>
              <NativeSelect className="w-full" value={health} onChange={(event) => setHealth(event.target.value as EpicHealth | "")}>
                <NativeSelectOption value="">{t(($) => $.epic.health_none)}</NativeSelectOption>
                {healthValues.map((value) => (
                  <NativeSelectOption key={value} value={value}>{t(($) => $.epic.healths[value])}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t(($) => $.epic.start_date)}>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label={t(($) => $.epic.target_date)}>
              <Input type="date" value={targetDate} min={startDate || undefined} onChange={(event) => setTargetDate(event.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t(($) => $.delete_dialog.cancel)}</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {createEpic.isPending && <Loader2 className="size-4 animate-spin" />}
            {t(($) => $.epic.create)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
