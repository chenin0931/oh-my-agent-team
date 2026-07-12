import type { Workspace } from "../types";
import { paths } from "./paths";

/**
 * Workspace presence is the only post-auth routing decision:
 *   workspace[0] → /<first.slug>/issues
 *   no workspace → /workspaces/new
 *
 * First-run education happens inside the workspace product tour. It never
 * blocks access and is not part of authentication or route resolution.
 */
export function resolvePostAuthDestination(
  workspaces: Workspace[],
): string {
  const first = workspaces[0];
  if (first) {
    return paths.workspace(first.slug).issues();
  }
  return paths.newWorkspace();
}
