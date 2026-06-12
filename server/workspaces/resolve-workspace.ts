import "server-only";

import { AppError } from "@/server/errors";

export type ResolvedWorkspace = {
  id: string;
  slug: string;
};

/**
 * Resolve workspaceSlug from the URL to a workspace record.
 * Implemented in Phase 2.
 */
export async function resolveWorkspace(
  _workspaceSlug: string,
): Promise<ResolvedWorkspace> {
  throw new AppError("INTERNAL_ERROR", "Workspace resolution is not implemented yet.", {
    expose: false,
  });
}
