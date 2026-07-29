import "server-only";

import { AppError } from "@/server/errors";
import { findProjectById } from "@/server/repositories/projects";
import { resolveAllowedProjectIds } from "@/server/permissions/require-project-access";

/**
 * Validates that a project exists in the workspace and is active (not archived).
 * Use for new record assignment and updates that set projectId.
 */
export async function validateActiveProjectId(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await findProjectById(workspaceId, projectId);

  if (!project || project.archivedAt) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Project must exist in this workspace and not be archived.",
    );
  }
}

/**
 * Validates project belongs to workspace (archived allowed — for reads/filters).
 */
export async function validateProjectIdInWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await findProjectById(workspaceId, projectId);

  if (!project) {
    throw new AppError("VALIDATION_ERROR", "Project not found in this workspace.");
  }
}

/** Validates optional list/dashboard `projectId` filters belong to the workspace. */
export async function assertValidProjectFilter(
  workspaceId: string,
  projectId: string | undefined,
): Promise<void> {
  if (!projectId) {
    return;
  }

  await validateProjectIdInWorkspace(workspaceId, projectId);
}

/**
 * Resolve effective project filter for a user.
 * If the user has full workspace access (owner/admin), returns the explicit filter or undefined.
 * If the user has project-scoped access, narrows to the intersection of their grants and the filter.
 * Throws if the user tries to access a project they don't have access to.
 */
export async function resolveProjectScopeForUser(
  workspaceId: string,
  userId: string,
  requestedProjectId?: string,
): Promise<{ projectId?: string; allowedProjectIds: string[] | null }> {
  const allowedProjectIds = await resolveAllowedProjectIds(workspaceId, userId);

  if (allowedProjectIds === null) {
    if (requestedProjectId) {
      await assertValidProjectFilter(workspaceId, requestedProjectId);
    }
    return { projectId: requestedProjectId, allowedProjectIds: null };
  }

  if (requestedProjectId) {
    if (!allowedProjectIds.includes(requestedProjectId)) {
      throw new AppError(
        "PERMISSION_DENIED",
        "You do not have access to this project.",
      );
    }
    return { projectId: requestedProjectId, allowedProjectIds };
  }

  return { projectId: undefined, allowedProjectIds };
}

/**
 * Build a MongoDB filter constraint for project-scoped queries.
 * Returns a `projectId` filter clause to merge into query objects.
 */
export function buildProjectScopeFilter(
  allowedProjectIds: string[] | null,
  requestedProjectId?: string,
): Record<string, unknown> {
  if (requestedProjectId) {
    return { projectId: requestedProjectId };
  }

  if (allowedProjectIds !== null) {
    return { projectId: { $in: allowedProjectIds } };
  }

  return {};
}
