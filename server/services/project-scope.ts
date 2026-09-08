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
 * Active workspace members (and admins) get unrestricted access (allowedProjectIds === null).
 * Grant-only collaborators are narrowed to their ProjectGrant IDs.
 * Throws if a grant-only user requests a project outside their grants.
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
