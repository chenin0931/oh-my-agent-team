import type { AgentRuntime, RuntimeProfile } from "@ohmyagentteam/core/types";

function stripRuntimeHostSuffix(name: string): string {
  const match = name.match(/^(.+?)\s+\([^)]+\)$/);
  return (match?.[1] ?? name).trim();
}

function looksLikeManus(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !!normalized && /(^|[^a-z0-9])manus([^a-z0-9]|$)/.test(normalized);
}

function looksLikeFeishuAily(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    !!normalized &&
    (normalized.includes("飞书") ||
      /(^|[^a-z0-9])feishu([^a-z0-9]|$)/.test(normalized) ||
      /(^|[^a-z0-9])aily([^a-z0-9]|$)/.test(normalized))
  );
}

export function runtimeLogoProvider(
  runtime: Pick<AgentRuntime, "provider" | "name">,
  profile?: Pick<RuntimeProfile, "display_name" | "command_name"> | null,
): string {
  if (
    looksLikeFeishuAily(profile?.display_name) ||
    looksLikeFeishuAily(profile?.command_name) ||
    looksLikeFeishuAily(stripRuntimeHostSuffix(runtime.name))
  ) {
    return "feishu";
  }
  if (
    looksLikeManus(profile?.display_name) ||
    looksLikeManus(profile?.command_name) ||
    looksLikeManus(stripRuntimeHostSuffix(runtime.name))
  ) {
    return "manus";
  }
  return runtime.provider;
}

export function runtimeProfileLogoProvider(
  profile: Pick<
    RuntimeProfile,
    "protocol_family" | "display_name" | "command_name"
  >,
): string {
  if (
    looksLikeFeishuAily(profile.display_name) ||
    looksLikeFeishuAily(profile.command_name)
  ) {
    return "feishu";
  }
  if (
    looksLikeManus(profile.display_name) ||
    looksLikeManus(profile.command_name)
  ) {
    return "manus";
  }
  return profile.protocol_family;
}
