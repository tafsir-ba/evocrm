import "server-only";

import { AppError } from "@/server/errors";
import {
  countActiveMembershipsWithRole,
  findMembershipByIdInWorkspace,
  type MembershipRecord,
} from "@/server/repositories/memberships";
import {
  findRoleByIdInWorkspace,
  findRoleByWorkspaceAndKey,
} from "@/server/repositories/roles";

async function isOwnerMembership(
  membership: MembershipRecord,
  workspaceId: string,
): Promise<boolean> {
  const ownerRole = await findRoleByWorkspaceAndKey(workspaceId, "owner");

  if (!ownerRole) {
    throw new AppError("INTERNAL_ERROR", "Owner role not found.", {
      expose: false,
    });
  }

  return membership.roleId === ownerRole.id;
}

/**
 * Blocks changes that would leave the workspace without an active owner.
 */
export async function assertOwnerProtection(input: {
  workspaceId: string;
  membership: MembershipRecord;
  actorUserId: string;
  nextRoleId?: string;
  nextStatus?: MembershipRecord["status"];
}): Promise<void> {
  const isOwner = await isOwnerMembership(input.membership, input.workspaceId);

  if (!isOwner) {
    return;
  }

  const ownerRole = await findRoleByWorkspaceAndKey(input.workspaceId, "owner");

  if (!ownerRole) {
    throw new AppError("INTERNAL_ERROR", "Owner role not found.", {
      expose: false,
    });
  }

  const activeOwnerCount = await countActiveMembershipsWithRole(
    input.workspaceId,
    ownerRole.id,
  );

  const demotingRole =
    input.nextRoleId !== undefined && input.nextRoleId !== ownerRole.id;
  const deactivating =
    input.nextStatus !== undefined &&
    input.nextStatus !== "active" &&
    input.membership.status === "active";

  if (!demotingRole && !deactivating) {
    return;
  }

  if (activeOwnerCount <= 1) {
    throw new AppError(
      "FORBIDDEN",
      "Cannot remove or demote the last active owner. Reassign ownership first.",
    );
  }
}

/**
 * @deprecated Use assertOwnerProtection — kept for existing tests.
 */
export async function assertOwnerMembershipRemovable(input: {
  workspaceId: string;
  membershipId: string;
  userId: string;
}): Promise<void> {
  const membership = await findMembershipByIdInWorkspace(
    input.membershipId,
    input.workspaceId,
  );

  if (!membership || membership.userId !== input.userId) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  await assertOwnerProtection({
    workspaceId: input.workspaceId,
    membership,
    actorUserId: input.userId,
    nextStatus: "removed",
  });
}

export async function assertRoleBelongsToWorkspace(
  workspaceId: string,
  roleId: string,
): Promise<void> {
  const role = await findRoleByIdInWorkspace(roleId, workspaceId);

  if (!role) {
    throw new AppError("VALIDATION_ERROR", "Role must belong to this workspace.");
  }
}

export async function assertMembershipManageable(
  workspaceId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const membership = await findMembershipByIdInWorkspace(
    membershipId,
    workspaceId,
  );

  if (!membership) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  return membership;
}
