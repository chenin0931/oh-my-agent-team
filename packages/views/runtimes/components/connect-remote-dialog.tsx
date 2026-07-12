"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Circle, Copy, Laptop, Terminal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import {
  runtimeKeys,
  runtimeListOptions,
} from "@ohmyagentteam/core/runtimes/queries";
import { useWSEvent } from "@ohmyagentteam/core/realtime";
import { paths, useWorkspaceSlug } from "@ohmyagentteam/core/paths";
import { useConfigStore } from "@ohmyagentteam/core/config";
import type { AgentRuntime } from "@ohmyagentteam/core/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ohmyagentteam/ui/components/ui/dialog";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import { CODE_LIGATURE_CLASS } from "@ohmyagentteam/ui/lib/code-style";
import { copyText } from "@ohmyagentteam/ui/lib/clipboard";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { ProviderLogo } from "./provider-logo";
import {
  DESKTOP_AGENT_CATALOG,
  desktopAgentCatalogItem,
  type DesktopAgentProvider,
} from "./desktop-agent-catalog";

type Step = "connect" | "success";

const INSTALL_URL =
  "https://raw.githubusercontent.com/chenin0931/oh-my-agent-team/main/scripts/install.sh";
const CLOUD_SERVER_URL = "https://api.ohmyagentteam.com";
const CLOUD_APP_URL = "https://ohmyagentteam.com";

function normalizeCommandURL(url: string | undefined) {
  return url?.trim().replace(/\/+$/, "") ?? "";
}

export function daemonCommands(
  serverUrl: string | undefined,
  appUrl: string | undefined,
) {
  const normalizedServerUrl = normalizeCommandURL(serverUrl);
  const normalizedAppUrl = normalizeCommandURL(appUrl);
  if (normalizedServerUrl && normalizedAppUrl) {
    return {
      setupCmd: `omat setup self-host --server-url ${normalizedServerUrl} --app-url ${normalizedAppUrl}`,
      tokenCmd: `omat config set server_url ${normalizedServerUrl}\nomat config set app_url ${normalizedAppUrl}\nomat login --token <YOUR_TOKEN>\nomat daemon start`,
    };
  }

  return {
    setupCmd: "omat setup",
    tokenCmd: `omat config set server_url ${CLOUD_SERVER_URL}\nomat config set app_url ${CLOUD_APP_URL}\nomat login --token <YOUR_TOKEN>\nomat daemon start`,
  };
}

export function desktopAgentConnectCommand(
  serverUrl: string | undefined,
  appUrl: string | undefined,
) {
  const normalizedServerUrl = normalizeCommandURL(serverUrl);
  const normalizedAppUrl = normalizeCommandURL(appUrl);
  const base = `curl -fsSL ${INSTALL_URL} | bash -s -- --connect`;
  if (!normalizedServerUrl || !normalizedAppUrl) return base;
  return `${base} --server-url ${normalizedServerUrl} --app-url ${normalizedAppUrl}`;
}

export function ConnectDesktopAgentDialog({
  initialProvider,
  onClose,
}: {
  initialProvider?: DesktopAgentProvider | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("connect");
  const [provider, setProvider] = useState<DesktopAgentProvider | null>(
    initialProvider ?? null,
  );
  const [connectedRuntime, setConnectedRuntime] = useState<AgentRuntime | null>(
    null,
  );
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const wsId = useWorkspaceId();
  const slug = useWorkspaceSlug();
  const qc = useQueryClient();
  const navigation = useNavigation();

  const handleDaemonRegister = useCallback(
    (payload: unknown) => {
      void (async () => {
        await qc.invalidateQueries({ queryKey: runtimeKeys.all(wsId) });
        let runtimes: AgentRuntime[] = [];
        try {
          runtimes = await qc.fetchQuery(runtimeListOptions(wsId));
        } catch {
          return;
        }

        const event = payload as Record<string, unknown> | null;
        const runtimeId =
          typeof event?.runtime_id === "string" ? event.runtime_id : null;
        const selectedProvider = providerRef.current;
        const runtime =
          (runtimeId
            ? runtimes.find((item) => item.id === runtimeId)
            : undefined) ??
          runtimes.find(
            (item) =>
              item.status === "online" &&
              (!selectedProvider ||
                item.provider.toLowerCase() === selectedProvider),
          );

        if (!runtime) return;
        if (
          selectedProvider &&
          runtime.provider.toLowerCase() !== selectedProvider
        ) {
          return;
        }
        setConnectedRuntime(runtime);
        setStep("success");
      })();
    },
    [qc, wsId],
  );
  useWSEvent("daemon:register", handleDaemonRegister);

  const handleCreateTeamAgent = () => {
    onClose();
    if (!slug || !connectedRuntime) return;
    const query = new URLSearchParams({
      create: "1",
      desktop_agent: connectedRuntime.id,
    });
    navigation.push(`${paths.workspace(slug).agents()}?${query.toString()}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-xl">
        {step === "connect" ? (
          <ConnectStep
            provider={provider}
            onProviderChange={setProvider}
            onClose={onClose}
          />
        ) : (
          <SuccessStep
            runtime={connectedRuntime}
            onClose={onClose}
            onCreateTeamAgent={handleCreateTeamAgent}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Use ConnectDesktopAgentDialog. */
export const ConnectRemoteDialog = ConnectDesktopAgentDialog;

function CopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    void copyText(text).then((ok) => ok && setCopied(true));
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </button>
  );
}

function CommandBlock({ command }: { command: string }) {
  const { t } = useT("runtimes");
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/45 px-3 py-3 font-mono text-xs">
      <Terminal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <code
        className={cn(
          "min-w-0 flex-1 break-all whitespace-pre-wrap",
          CODE_LIGATURE_CLASS,
        )}
      >
        {command}
      </code>
      <CopyButton text={command} ariaLabel={t(($) => $.connect.copy_aria)} />
    </div>
  );
}

function ConnectStep({
  provider,
  onProviderChange,
  onClose,
}: {
  provider: DesktopAgentProvider | null;
  onProviderChange: (provider: DesktopAgentProvider | null) => void;
  onClose: () => void;
}) {
  const { t } = useT("runtimes");
  const daemonServerUrl = useConfigStore((state) => state.daemonServerUrl);
  const daemonAppUrl = useConfigStore((state) => state.daemonAppUrl);
  const command = desktopAgentConnectCommand(daemonServerUrl, daemonAppUrl);
  const fallbackCommand = daemonCommands(
    daemonServerUrl,
    daemonAppUrl,
  ).tokenCmd;
  const tool = desktopAgentCatalogItem(provider);

  return (
    <>
      <DialogHeader className="border-b px-6 py-5">
        <DialogTitle className="font-serif text-xl font-medium">
          {tool
            ? t(($) => $.connect.title_with_name, { name: tool.name })
            : t(($) => $.connect.title)}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">
          {tool
            ? t(($) => $.connect.description_with_name, { name: tool.name })
            : t(($) => $.connect.description)}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {!tool && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t(($) => $.connect.choose_title)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DESKTOP_AGENT_CATALOG.map((item) => (
                <button
                  key={item.provider}
                  type="button"
                  onClick={() => onProviderChange(item.provider)}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border bg-background px-2 py-3 text-center transition-colors hover:bg-accent/40"
                >
                  <ProviderLogo provider={item.provider} className="size-6" />
                  <span className="text-xs font-medium">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tool && (
          <>
            <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
              <span className="flex size-10 items-center justify-center rounded-md border bg-background">
                <ProviderLogo provider={tool.provider} className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{tool.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.connect.selected_hint)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onProviderChange(null)}
              >
                {t(($) => $.connect.change)}
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">
                {t(($) => $.connect.command_title)}
              </p>
              <CommandBlock command={command} />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t(($) => $.connect.command_hint)}
              </p>
            </div>

            <ConnectionProgress name={tool.name} />

            <details className="group rounded-md border border-dashed">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                {t(($) => $.connect.tool_help_title, { name: tool.name })}
              </summary>
              <div className="space-y-3 border-t px-3 py-3">
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.connect.tool_help_description, { name: tool.name })}
                </p>
                <CommandBlock command={tool.installCommand} />
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.connect.tool_login_hint, {
                    name: tool.name,
                    command: tool.launchCommand,
                  })}
                </p>
              </div>
            </details>

            <details className="group rounded-md border border-dashed">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                {t(($) => $.connect.troubleshooting)}
              </summary>
              <div className="space-y-3 border-t px-3 py-3">
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.connect.trouble_intro)}
                </p>
                <CommandBlock command={fallbackCommand} />
              </div>
            </details>
          </>
        )}
      </div>

      <DialogFooter className="border-t bg-muted/20 px-6 py-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t(($) => $.connect.cancel)}
        </Button>
      </DialogFooter>
    </>
  );
}

function ConnectionProgress({ name }: { name: string }) {
  const { t } = useT("runtimes");
  return (
    <div className="rounded-md border px-3 py-3" role="status" aria-live="polite">
      <p className="mb-2 text-xs font-medium">
        {t(($) => $.connect.waiting_title, { name })}
      </p>
      <div className="space-y-2 text-xs text-muted-foreground">
        <ProgressRow label={t(($) => $.connect.progress_computer)} active />
        <ProgressRow
          label={t(($) => $.connect.progress_tool, { name })}
        />
        <ProgressRow label={t(($) => $.connect.progress_ready)} />
      </div>
    </div>
  );
}

function ProgressRow({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex size-3 items-center justify-center">
        {active && (
          <span className="absolute size-2 animate-ping rounded-full bg-success/50 motion-reduce:hidden" />
        )}
        <Circle
          className={cn(
            "relative size-2.5",
            active ? "fill-success text-success" : "text-muted-foreground/35",
          )}
        />
      </span>
      <span>{label}</span>
    </div>
  );
}

function SuccessStep({
  runtime,
  onClose,
  onCreateTeamAgent,
}: {
  runtime: AgentRuntime | null;
  onClose: () => void;
  onCreateTeamAgent: () => void;
}) {
  const { t } = useT("runtimes");
  const tool = desktopAgentCatalogItem(
    runtime?.provider.toLowerCase() as DesktopAgentProvider | undefined,
  );
  const name = tool?.name ?? runtime?.name ?? t(($) => $.connect.desktop_agent);
  return (
    <>
      <DialogHeader className="px-6 pt-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success/10">
          <Check className="size-6 text-success" />
        </div>
        <DialogTitle className="font-serif text-xl font-medium">
          {t(($) => $.connect.success_title, { name })}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">
          {t(($) => $.connect.success_description, { name })}
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-5">
        <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
          <span className="flex size-10 items-center justify-center rounded-md border bg-background">
            {tool ? (
              <ProviderLogo provider={tool.provider} className="size-6" />
            ) : (
              <Laptop className="size-5 text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {runtime?.device_info || t(($) => $.connect.device_connected)}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-success">
            <span className="size-1.5 rounded-full bg-success" />
            {t(($) => $.connect.online)}
          </span>
        </div>
      </div>

      <DialogFooter className="border-t bg-muted/20 px-6 py-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t(($) => $.connect.later)}
        </Button>
        <Button size="sm" onClick={onCreateTeamAgent} disabled={!runtime}>
          {t(($) => $.connect.create_team_agent)}
          <ChevronRight className="size-4" />
        </Button>
      </DialogFooter>
    </>
  );
}
