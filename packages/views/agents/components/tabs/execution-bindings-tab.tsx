"use client";

import { useMemo, useState } from "react";
import { MonitorCog, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentExecutionBinding, AgentRuntime } from "@ohmyagentteam/core/types";
import { api } from "@ohmyagentteam/core/api";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@ohmyagentteam/ui/components/ui/native-select";
import { Switch } from "@ohmyagentteam/ui/components/ui/switch";
import { useT } from "../../../i18n";

const bindingKey = (workspaceId: string, agentId: string) =>
  ["agent-execution-bindings", workspaceId, agentId] as const;

export function ExecutionBindingsTab({
  agent,
  runtimes,
  canEdit,
}: {
  agent: Agent;
  runtimes: AgentRuntime[];
  canEdit: boolean;
}) {
  const { t } = useT("agents");
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [selectedRuntime, setSelectedRuntime] = useState("");
  const [savingRuntime, setSavingRuntime] = useState<string | null>(null);
  const { data: bindings = [], isLoading } = useQuery({
    queryKey: bindingKey(workspaceId, agent.id),
    queryFn: () => api.listAgentExecutionBindings(agent.id),
  });

  const primary = runtimes.find((runtime) => runtime.id === agent.runtime_id) ?? null;
  const boundIDs = useMemo(() => new Set(bindings.map((binding) => binding.runtime_id)), [bindings]);
  const compatibleRuntimes = useMemo(
    () =>
      runtimes.filter((runtime) => {
        if (boundIDs.has(runtime.id)) return false;
        if (!primary) return true;
        if (runtime.provider !== primary.provider) return false;
        const primaryProfile = primary.profile_id ?? null;
        const candidateProfile = runtime.profile_id ?? null;
        return primaryProfile === candidateProfile;
      }),
    [boundIDs, primary, runtimes],
  );

  const replaceBindings = (next: AgentExecutionBinding[]) => {
    queryClient.setQueryData(bindingKey(workspaceId, agent.id), next);
  };

  const saveBinding = async (runtimeId: string, priority: number, enabled: boolean) => {
    setSavingRuntime(runtimeId);
    try {
      replaceBindings(
        await api.upsertAgentExecutionBinding(agent.id, {
          runtime_id: runtimeId,
          priority,
          enabled,
        }),
      );
      toast.success(t(($) => $.tab_body.execution_bindings.saved));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.tab_body.execution_bindings.failed));
    } finally {
      setSavingRuntime(null);
    }
  };

  const addBinding = async () => {
    if (!selectedRuntime) return;
    await saveBinding(selectedRuntime, Math.max(100, bindings.length * 100), true);
    setSelectedRuntime("");
  };

  const removeBinding = async (binding: AgentExecutionBinding) => {
    setSavingRuntime(binding.runtime_id);
    try {
      await api.deleteAgentExecutionBinding(agent.id, binding.runtime_id);
      replaceBindings(bindings.filter((item) => item.runtime_id !== binding.runtime_id));
      toast.success(t(($) => $.tab_body.execution_bindings.removed));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.tab_body.execution_bindings.failed));
    } finally {
      setSavingRuntime(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">{t(($) => $.tab_body.execution_bindings.title)}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          {t(($) => $.tab_body.execution_bindings.description)}
        </p>
      </div>

      {canEdit && compatibleRuntimes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y py-3">
          <NativeSelect
            className="min-w-64 flex-1"
            value={selectedRuntime}
            onChange={(event) => setSelectedRuntime(event.target.value)}
            aria-label={t(($) => $.tab_body.execution_bindings.add_label)}
          >
            <NativeSelectOption value="">{t(($) => $.tab_body.execution_bindings.add_placeholder)}</NativeSelectOption>
            {compatibleRuntimes.map((runtime) => (
              <NativeSelectOption key={runtime.id} value={runtime.id}>
                {runtime.custom_name || runtime.name} · {runtime.provider}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button size="sm" onClick={addBinding} disabled={!selectedRuntime || savingRuntime !== null}>
            <Plus className="size-4" />
            {t(($) => $.tab_body.execution_bindings.add)}
          </Button>
        </div>
      ) : null}

      <div className="divide-y border-y">
        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t(($) => $.tab_body.execution_bindings.loading)}</p>
        ) : bindings.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <MonitorCog className="mb-2 size-5 text-muted-foreground" />
            <p className="text-sm font-medium">{t(($) => $.tab_body.execution_bindings.empty_title)}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t(($) => $.tab_body.execution_bindings.empty_description)}</p>
          </div>
        ) : (
          bindings.map((binding) => {
            const isPrimary = binding.runtime_id === agent.runtime_id;
            const busy = savingRuntime === binding.runtime_id;
            return (
              <div key={binding.id} className="flex min-w-0 items-center gap-3 py-3">
                <span className={`size-2 shrink-0 rounded-full ${binding.status === "online" ? "bg-success" : "bg-muted-foreground/30"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{binding.runtime_name}</span>
                    {isPrimary ? <span className="border px-1.5 py-0.5 text-[10px] text-muted-foreground">{t(($) => $.tab_body.execution_bindings.primary)}</span> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {binding.provider} · {binding.status === "online" ? t(($) => $.tab_body.execution_bindings.online) : t(($) => $.tab_body.execution_bindings.offline)} · {t(($) => $.tab_body.execution_bindings.active_count, { count: binding.active_task_count })}
                  </p>
                </div>
                <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                  {t(($) => $.tab_body.execution_bindings.priority)}
                  <input
                    className="h-8 w-16 rounded-md border bg-background px-2 text-xs"
                    type="number"
                    min={0}
                    max={1000}
                    defaultValue={binding.priority}
                    disabled={!canEdit || busy}
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next !== binding.priority) void saveBinding(binding.runtime_id, next, binding.enabled);
                    }}
                  />
                </label>
                <Switch
                  checked={binding.enabled}
                  disabled={!canEdit || busy || isPrimary}
                  onCheckedChange={(enabled) => void saveBinding(binding.runtime_id, binding.priority, enabled)}
                  aria-label={t(($) => $.tab_body.execution_bindings.toggle, { name: binding.runtime_name })}
                />
                {canEdit && !isPrimary ? (
                  <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => void removeBinding(binding)} title={t(($) => $.tab_body.execution_bindings.remove)}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t(($) => $.tab_body.execution_bindings.order_hint)}</p>
    </div>
  );
}
