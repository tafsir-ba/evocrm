import "server-only";

import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";
import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  requireProjectAccess,
  resolveAllowedProjectIds,
} from "@/server/permissions/require-project-access";
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
 * Only grant-only (shared_project) callers are narrowed to granted project IDs.
 * Active workspace members keep full workspace scope (allowedProjectIds === null).
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
 * Deny get-by-id access when the record belongs to a project outside the caller's
 * allowed project scope. Grant-only callers are denied for records with no projectId.
 * Active workspace members are unrestricted by ProjectGrant.
 */
export async function assertRecordProjectAccess(
  workspaceId: string,
  userId: string | undefined,
  projectId: string | null | undefined,
  permission?: PermissionKey,
): Promise<void> {
  if (!PROJECT_SHARING_ENABLED || !userId) {
    return;
  }

  if (!projectId) {
    const allowedProjectIds = await resolveAllowedProjectIds(workspaceId, userId);
    if (allowedProjectIds !== null) {
      throw new AppError(
        "PERMISSION_DENIED",
        "You do not have access to this record.",
      );
    }
    return;
  }

  await requireProjectAccess(workspaceId, userId, projectId, permission);
}

/**
 * Enforce grant scope for multi-project records (e.g. campaigns).
 * Workspace-wide records (empty projectIds) are denied for project-scoped callers.
 */
export async function assertMultiProjectRecordAccess(
  workspaceId: string,
  userId: string | undefined,
  recordProjectIds: readonly string[],
  permission?: PermissionKey,
): Promise<void> {
  if (!PROJECT_SHARING_ENABLED || !userId) {
    return;
  }

  const allowedProjectIds = await resolveAllowedProjectIds(workspaceId, userId);
  if (allowedProjectIds === null) {
    return;
  }

  if (recordProjectIds.length === 0) {
    throw new AppError(
      "PERMISSION_DENIED",
      "You do not have access to this record.",
    );
  }

  const matchingProjectId = recordProjectIds.find((projectId) =>
    allowedProjectIds.includes(projectId),
  );

  if (!matchingProjectId) {
    throw new AppError(
      "PERMISSION_DENIED",
      "You do not have access to this project.",
    );
  }

  if (permission) {
    await requireProjectAccess(workspaceId, userId, matchingProjectId, permission);
  }
}
