import "server-only";

import { AppError } from "@/server/errors";

/**
 * Require a specific permission key within the resolved workspace context.
 * Implemented in Phase 2+.
 */
export async function requirePermission(
  _workspaceId: string,
  _userId: string,
  _permissionKey: string,
): Promise<void> {
  throw new AppError("INTERNAL_ERROR", "Permission checks are not implemented yet.", {
    expose: false,
  });
}
