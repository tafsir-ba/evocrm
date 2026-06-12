import "server-only";

import { AppError } from "@/server/errors";
import { findMembership } from "@/server/repositories/memberships";
import { findRoleByWorkspaceAndKey } from "@/server/repositories/roles";

/**
 * Foundational owner protection — used before membership removal or owner demotion.
 * Full ownership transfer flow is deferred to Phase 11.
 */
export async function assertOwnerMembershipRemovable(input: {
  workspaceId: string;
  membershipId: string;
  userId: string;
}): Promise<void> {
  const membership = await findMembership(input.userId, input.workspaceId);

  if (!membership || membership.id !== input.membershipId) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  const ownerRole = await findRoleByWorkspaceAndKey(input.workspaceId, "owner");

  if (!ownerRole) {
    throw new AppError("INTERNAL_ERROR", "Owner role not found.", {
      expose: false,
    });
  }

  if (membership.roleId !== ownerRole.id) {
    return;
  }

  throw new AppError(
    "FORBIDDEN",
    "Owner membership cannot be removed without ownership transfer.",
  );
}
