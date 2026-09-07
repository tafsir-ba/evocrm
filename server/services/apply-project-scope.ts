import "server-only";

import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";
import type { PermissionKey } from "@/server/permissions/permissions";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import {
  assertValidProjectFilter,
  resolveProjectScopeForUser,
} from "@/server/services/project-scope";

export type ProjectScopedFilter = {
  projectId?: string;
  projectIds?: string[];
};

/**
 * Apply ProjectGrant scope when sharing is enabled.
 * Workspace owners/admins keep full access (allowedProjectIds === null).
 */
export async function applyUserProjectScope<T extends ProjectScopedFilter>(
  workspaceId: string,
  userId: string | undefined,
  filter: T,
): Promise<T> {
  if (!PROJECT_SHARING_ENABLED || !userId) {
    if (filter.projectId) {
      await assertValidProjectFilter(workspaceId, filter.projectId);
    }
    return filter;
  }

  const scope = await resolveProjectScopeForUser(
    workspaceId,
    userId,
    filter.projectId,
  );

  if (scope.projectId) {
    return {
      ...filter,
      projectId: scope.projectId,
      projectIds: undefined,
    };
  }

  if (scope.allowedProjectIds !== null) {
    return {
      ...filter,
      projectId: undefined,
      projectIds: scope.allowedProjectIds,
    };
  }

  return filter;
}

/**
 * Deny get-by-id access when the record belongs to a project outside the user's grants.
 */
export async function assertRecordProjectAccess(
  workspaceId: string,
  userId: string | undefined,
  projectId: string | null | undefined,
  permission?: PermissionKey,
): Promise<void> {
  if (!PROJECT_SHARING_ENABLED || !userId || !projectId) {
    return;
  }

  await requireProjectAccess(workspaceId, userId, projectId, permission);
}
