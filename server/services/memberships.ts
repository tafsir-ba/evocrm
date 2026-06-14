import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  assertOwnerProtection,
  assertRoleBelongsToWorkspace,
} from "@/server/permissions/owner-protection";
import {
  countAssignedRecords,
  hasAssignedRecords,
} from "@/server/repositories/reassignment";
import {
  createMembership,
  findMembership,
  findMembershipByIdInWorkspace,
  findMembershipsForWorkspace,
  reactivateMembership,
  updateMembership,
  type MembershipRecord,
} from "@/server/repositories/memberships";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import { findUserByEmail, findUserById } from "@/server/repositories/users";
import type {
  CreateMembershipInput,
  UpdateMembershipInput,
} from "@/server/validation/memberships";

export type MembershipListItem = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  roleId: string;
  roleName: string;
  roleKey: string;
  isOwnerRole: boolean;
  status: MembershipRecord["status"];
  joinedAt: string | null;
  createdAt: string;
};

async function toMembershipListItem(
  membership: MembershipRecord,
): Promise<MembershipListItem> {
  const [user, role] = await Promise.all([
    findUserById(membership.userId),
    findRoleByIdInWorkspace(membership.roleId, membership.workspaceId),
  ]);

  if (!user) {
    throw new AppError("INTERNAL_ERROR", "Membership user not found.", {
      expose: false,
    });
  }

  return {
    id: membership.id,
    userId: membership.userId,
    name: user.name ?? null,
    email: user.email,
    image: user.image ?? null,
    roleId: membership.roleId,
    roleName: role?.name ?? "Unknown",
    roleKey: role?.key ?? "unknown",
    isOwnerRole: role?.key === "owner",
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
  };
}

export async function listMembershipsForWorkspace(
  workspaceId: string,
  filters?: { status?: MembershipRecord["status"] },
): Promise<MembershipListItem[]> {
  const memberships = await findMembershipsForWorkspace(workspaceId, filters);
  const items = await Promise.all(
    memberships.map((membership) => toMembershipListItem(membership)),
  );

  return items.sort((left, right) =>
    (left.name ?? left.email).localeCompare(right.name ?? right.email),
  );
}

export async function addMembershipToWorkspace(input: {
  workspaceId: string;
  actorId: string;
  data: CreateMembershipInput;
}): Promise<MembershipListItem> {
  await assertRoleBelongsToWorkspace(input.workspaceId, input.data.roleId);

  const user = await findUserByEmail(input.data.email);

  if (!user) {
    throw new AppError(
      "NOT_FOUND",
      "No user account exists for this email. Email invitation delivery is not implemented yet.",
    );
  }

  const existing = await findMembership(user.id, input.workspaceId);

  if (existing && existing.status !== "removed") {
    throw new AppError(
      "CONFLICT",
      "This user is already a member of this workspace.",
    );
  }

  let membership: MembershipRecord;

  if (existing?.status === "removed") {
    membership = await reactivateMembership({
      membershipId: existing.id,
      workspaceId: input.workspaceId,
      roleId: input.data.roleId,
      invitedBy: input.actorId,
    });
  } else {
    membership = await createMembership({
      userId: user.id,
      workspaceId: input.workspaceId,
      roleId: input.data.roleId,
      status: "active",
      invitedBy: input.actorId,
      joinedAt: new Date(),
    });
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "membership.created",
    entityType: "membership",
    entityId: membership.id,
    after: {
      userId: membership.userId,
      roleId: membership.roleId,
      status: membership.status,
    },
  });

  return toMembershipListItem(membership);
}

export async function updateMembershipInWorkspace(input: {
  workspaceId: string;
  membershipId: string;
  actorId: string;
  data: UpdateMembershipInput;
}): Promise<MembershipListItem> {
  const membership = await findMembershipByIdInWorkspace(
    input.membershipId,
    input.workspaceId,
  );

  if (!membership) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  if (input.data.roleId) {
    await assertRoleBelongsToWorkspace(input.workspaceId, input.data.roleId);
  }

  await assertOwnerProtection({
    workspaceId: input.workspaceId,
    membership,
    actorUserId: input.actorId,
    nextRoleId: input.data.roleId,
    nextStatus: input.data.status,
  });

  if (
    input.data.status &&
    membership.status === "active" &&
    input.data.status !== "active"
  ) {
    const counts = await countAssignedRecords(
      input.workspaceId,
      membership.userId,
    );

    if (hasAssignedRecords(counts)) {
      throw new AppError(
        "CONFLICT",
        "Member has active assigned records. Use the reassignment flow first.",
        { details: { counts } },
      );
    }
  }

  const updated = await updateMembership(
    input.membershipId,
    input.workspaceId,
    {
      roleId: input.data.roleId,
      status: input.data.status,
    },
  );

  if (input.data.roleId && input.data.roleId !== membership.roleId) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "membership.role_changed",
      entityType: "membership",
      entityId: membership.id,
      before: { roleId: membership.roleId },
      after: { roleId: updated.roleId },
    });
  }

  if (input.data.status && input.data.status !== membership.status) {
    const action =
      input.data.status === "suspended"
        ? "membership.suspended"
        : input.data.status === "removed"
          ? "membership.removed"
          : "membership.status_changed";

    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action,
      entityType: "membership",
      entityId: membership.id,
      before: { status: membership.status },
      after: { status: updated.status },
    });
  }

  return toMembershipListItem(updated);
}

export async function removeMembershipFromWorkspace(input: {
  workspaceId: string;
  membershipId: string;
  actorId: string;
}): Promise<MembershipListItem> {
  return updateMembershipInWorkspace({
    workspaceId: input.workspaceId,
    membershipId: input.membershipId,
    actorId: input.actorId,
    data: { status: "removed" },
  });
}

export async function createOwnerMembership(input: {
  userId: string;
  workspaceId: string;
  roleId: string;
}): Promise<MembershipRecord> {
  const membership = await createMembership({
    userId: input.userId,
    workspaceId: input.workspaceId,
    roleId: input.roleId,
    status: "active",
    joinedAt: new Date(),
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: "membership.created",
    entityType: "membership",
    entityId: membership.id,
    after: {
      userId: membership.userId,
      roleId: membership.roleId,
      status: membership.status,
    },
  });

  return membership;
}
