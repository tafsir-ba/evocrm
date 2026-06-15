import "server-only";

import { AppError } from "@/server/errors";
import { findProjectById } from "@/server/repositories/projects";

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
