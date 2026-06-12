import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { createMembership, type MembershipRecord } from "@/server/repositories/memberships";

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
