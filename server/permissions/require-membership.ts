import "server-only";

import { AppError } from "@/server/errors";

import type { WorkspaceMembership } from "./types";

/**
 * Require an active workspace membership for the current user.
 * Implemented in Phase 2.
 */
export async function requireMembership(
  _workspaceId: string,
  _userId: string,
): Promise<WorkspaceMembership> {
  throw new AppError("INTERNAL_ERROR", "Membership checks are not implemented yet.", {
    expose: false,
  });
}
