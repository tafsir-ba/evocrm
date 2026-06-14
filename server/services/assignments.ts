import "server-only";

import { AppError } from "@/server/errors";
import { findMembership } from "@/server/repositories/memberships";

/**
 * Validates that a user can receive record assignments in a workspace.
 * Only active memberships are assignable.
 */
export async function validateAssignableMember(
  workspaceId: string,
  userId: string,
  fieldLabel = "Assignee",
): Promise<void> {
  const membership = await findMembership(userId, workspaceId);

  if (!membership || membership.status !== "active") {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldLabel} must refer to an active workspace member.`,
    );
  }
}

/**
 * Optional assignee — skips validation when userId is null/undefined.
 */
export async function validateOptionalAssignableMember(
  workspaceId: string,
  userId: string | null | undefined,
  fieldLabel: string,
): Promise<void> {
  if (!userId) {
    return;
  }

  await validateAssignableMember(workspaceId, userId, fieldLabel);
}
