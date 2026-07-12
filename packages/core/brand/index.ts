export const BRAND_NAME = "OhMyAgentTeam";
export const BRAND_SHORT_NAME = "OMAT";
export const BRAND_TAGLINE = "People and agents, one team.";
export const BRAND_TAGLINE_ZH = "把人和 Agent 变成一个真正的团队。";

export const BRAND_DEEP_LINK_SCHEME = "ohmyagentteam";
export const LEGACY_DEEP_LINK_SCHEME = "ohmyagentteam";

/**
 * Marketing URLs are environment-owned until the new public domain is ready.
 * Local builds must never fall back to the legacy brand domain.
 */
export function brandSiteUrl(value?: string | null): string {
  const normalized = value?.trim();
  return normalized || "http://localhost:3000";
}
