import type { StorageAdapter } from "../types/storage";

/**
 * Keys that are namespaced per workspace (stored as `${key}:${slug}`).
 *
 * IMPORTANT: When adding a new workspace-scoped persist store or storage key,
 * add its key here so that workspace deletion and logout properly clean it up.
 * Also ensure the store uses `createWorkspaceAwareStorage` for its persist config.
 */
const WORKSPACE_SCOPED_KEYS = [
  "omat_issue_draft",
  "omat_issue_surface_views",
  "omat_issues_view",
  "omat_issues_scope",
  "omat_my_issues_view",
  "ohmyagentteam:chat:selectedAgentId",
  "ohmyagentteam:chat:activeSessionId",
  "ohmyagentteam:chat:drafts",
  "ohmyagentteam:chat:expanded",
  "omat_navigation",
];

/** Remove all workspace-scoped storage entries for the given workspace slug. */
export function clearWorkspaceStorage(
  adapter: StorageAdapter,
  slug: string,
) {
  for (const key of WORKSPACE_SCOPED_KEYS) {
    adapter.removeItem(`${key}:${slug}`);
  }
}
