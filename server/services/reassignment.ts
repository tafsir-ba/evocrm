import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { assertOwnerProtection } from "@/server/permissions/owner-protection";
import { validateAssignableMember } from "@/server/services/assignments";
import {
  countAssignedRecords,
  hasAssignedRecords,
  reassignAssignedRecords,
  type ReassignmentCounts,
  type ReassignmentUpdateCounts,
} from "@/server/repositories/reassignment";
import {
  findMembershipByIdInWorkspace,
  updateMembership,
} from "@/server/repositories/memberships";
import type { ReassignRecordsInput } from "@/server/validation/reassignment";

export type ReassignmentSummary = {
  membershipId: string;
  userId: string;
  counts: ReassignmentCounts;
  requiresReassignment: boolean;
};

export async function getReassignmentSummary(input: {
  workspaceId: string;
  membershipId: string;
}): Promise<ReassignmentSummary> {
  const membership = await findMembershipByIdInWorkspace(
    input.membershipId,
    input.workspaceId,
  );

  if (!membership) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  const counts = await countAssignedRecords(
    input.workspaceId,
    membership.userId,
  );

  return {
    membershipId: membership.id,
    userId: membership.userId,
    counts,
    requiresReassignment: hasAssignedRecords(counts),
  };
}

export async function reassignMembershipRecords(input: {
  workspaceId: string;
  membershipId: string;
  actorId: string;
  data: ReassignRecordsInput;
}): Promise<{
  updated: ReassignmentUpdateCounts;
  membershipStatus: string | null;
}> {
  const membership = await findMembershipByIdInWorkspace(
    input.membershipId,
    input.workspaceId,
  );

  if (!membership) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  await validateAssignableMember(
    input.workspaceId,
    input.data.replacementUserId,
    "Replacement member",
  );

  if (input.data.replacementUserId === membership.userId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Replacement member must be different from the source member.",
    );
  }

  if (input.data.newStatus) {
    await assertOwnerProtection({
      workspaceId: input.workspaceId,
      membership,
      actorUserId: input.actorId,
      nextStatus: input.data.newStatus,
    });
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "reassignment.started",
    entityType: "membership",
    entityId: membership.id,
    after: {
      sourceUserId: membership.userId,
      replacementUserId: input.data.replacementUserId,
    },
  });

  try {
    const updated = await reassignAssignedRecords(
      input.workspaceId,
      membership.userId,
      input.data.replacementUserId,
    );

    let membershipStatus: string | null = null;

    if (input.data.newStatus) {
      const statusUpdated = await updateMembership(
        input.membershipId,
        input.workspaceId,
        { status: input.data.newStatus },
      );
      membershipStatus = statusUpdated.status;

      const action =
        input.data.newStatus === "suspended"
          ? "membership.suspended"
          : "membership.removed";

      await createAuditLog({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action,
        entityType: "membership",
        entityId: membership.id,
        before: { status: membership.status },
        after: { status: statusUpdated.status },
      });
    }

    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "reassignment.completed",
      entityType: "membership",
      entityId: membership.id,
      after: { updated },
    });

    return { updated, membershipStatus };
  } catch (error) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "reassignment.failed",
      entityType: "membership",
      entityId: membership.id,
      after: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}
