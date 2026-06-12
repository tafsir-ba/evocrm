import "server-only";

import { AppError } from "@/server/errors";
import { findWorkspaceBySlug } from "@/server/repositories/workspaces";

export type ResolvedWorkspace = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  defaultCurrency: string;
};

/**
 * Resolve workspaceSlug from the URL to a workspace record.
 */
export async function resolveWorkspace(
  workspaceSlug: string,
): Promise<ResolvedWorkspace> {
  const workspace = await findWorkspaceBySlug(workspaceSlug);

  if (!workspace) {
    throw new AppError("WORKSPACE_NOT_FOUND", "Workspace not found.");
  }

  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    timezone: workspace.timezone,
    defaultCurrency: workspace.defaultCurrency,
  };
}
