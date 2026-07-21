import type { AgentRuntime, RuntimeProfile } from "../types";

function splitRuntimeName(name: string): {
  base: string;
  hostname: string | null;
} {
  const m = name.match(/^(.+?)\s+\(([^)]+)\)$/);
  if (!m || !m[1] || !m[2]) return { base: name, hostname: null };
  return { base: m[1], hostname: m[2] };
}

/**
 * The name to show for a runtime (MUL-4217): the user's custom override when
 * set, then the custom runtime profile display name when available, otherwise
 * the daemon-proposed default. Defends against older backends that omit
 * custom_name/profile_id and against whitespace-only overrides.
 */
export function runtimeDisplayName(
  runtime: Pick<AgentRuntime, "name" | "custom_name"> & {
    profile_id?: string | null;
    provider?: string;
  },
  profile?: Pick<RuntimeProfile, "display_name"> | null,
): string {
  const custom = runtime.custom_name?.trim();
  if (custom) return custom;

  const profileName = runtime.profile_id ? profile?.display_name.trim() : "";
  if (profileName) {
    const hostname = splitRuntimeName(runtime.name).hostname;
    return hostname ? `${profileName} (${hostname})` : profileName;
  }

  // The connection flow presents Tencent's CodeBuddy-backed desktop agent as
  // WorkBuddy. Keep that product-facing name consistent in runtime lists and
  // selectors while leaving the provider id and executable name untouched.
  if (runtime.provider === "codebuddy") {
    const { base, hostname } = splitRuntimeName(runtime.name);
    if (base.toLowerCase() === "codebuddy") {
      return hostname ? `WorkBuddy (${hostname})` : "WorkBuddy";
    }
  }

  return runtime.name;
}
