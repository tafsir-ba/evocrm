import "server-only";

import { LeadModel } from "@/models/lead";
import {
  buildMembershipProvenance,
  type NormalizedMembershipPlan,
} from "@/lib/lead-project-membership";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { connectDb } from "@/server/db/mongoose";
import {
  createMembership,
  findLeadIdsMissingMembership,
  findMembershipByLeadAndProject,
} from "@/server/repositories/lead-project-memberships";
import { planBackfillMembershipsForLead } from "@/server/services/lead-project-memberships";
import { toObjectIdString } from "@/server/utils/mongo-id";

export type LeadProjectMembershipBackfillResult = {
  dryRun: boolean;
  scanned: number;
  created: number;
  skipped: number;
  missingProject: number;
  idempotentHits: number;
};

const BACKFILL_PAGE_SIZE = 250;

export async function backfillLeadProjectMemberships(options: {
  workspaceId?: string;
  actorId: string;
  dryRun?: boolean;
}): Promise<LeadProjectMembershipBackfillResult> {
  const dryRun = options.dryRun ?? false;
  await connectDb();

  const query: Record<string, unknown> = {
    projectId: { $ne: null },
    archivedAt: null,
  };
  if (options.workspaceId) {
    query.workspaceId = options.workspaceId;
  }

  const result: LeadProjectMembershipBackfillResult = {
    dryRun,
    scanned: 0,
    created: 0,
    skipped: 0,
    missingProject: 0,
    idempotentHits: 0,
  };

  type BackfillLeadDocument = {
    _id: { toString(): string };
    workspaceId: { toString(): string };
    projectId?: unknown;
    createdAt?: Date;
  };

  let afterId: string | null = null;

  while (true) {
    const pageQuery: Record<string, unknown> = afterId
      ? { ...query, _id: { $gt: afterId } }
      : query;
    const documents = await LeadModel.find(pageQuery)
      .sort({ _id: 1 })
      .limit(BACKFILL_PAGE_SIZE)
      .select({ _id: 1, workspaceId: 1, projectId: 1, createdAt: 1 })
      .lean<BackfillLeadDocument[]>();

    if (documents.length === 0) {
      break;
    }

    const leadIds = documents.map((document) => document._id.toString());
    const missingByWorkspace = new Map<string, string[]>();
    for (const document of documents) {
      const workspaceId = document.workspaceId.toString();
      const current = missingByWorkspace.get(workspaceId) ?? [];
      current.push(document._id.toString());
      missingByWorkspace.set(workspaceId, current);
    }

    const missing = new Set<string>();
    for (const [workspaceId, ids] of missingByWorkspace) {
      const absent = await findLeadIdsMissingMembership(workspaceId, ids);
      for (const id of absent) {
        missing.add(id);
      }
    }

    for (const document of documents) {
      result.scanned += 1;
      const leadId = document._id.toString();
      const workspaceId = document.workspaceId.toString();
      const projectId = toObjectIdString(document.projectId);
      if (!projectId) {
        result.missingProject += 1;
        continue;
      }

      const planned = planBackfillMembershipsForLead({
        projectId,
        createdAt: document.createdAt,
      });
      if (!planned.ok) {
        result.skipped += 1;
        continue;
      }

      const plan = planned.memberships[0] as NormalizedMembershipPlan;
      const already = await findMembershipByLeadAndProject(workspaceId, leadId, plan.projectId);
      if (already || !missing.has(leadId)) {
        result.idempotentHits += 1;
        continue;
      }

      if (dryRun) {
        result.created += 1;
        continue;
      }

      await createMembership({
        workspaceId,
        leadId,
        projectId: plan.projectId,
        isPrimary: true,
        joinedAt: plan.joinedAt,
        sourceOrder: plan.sourceOrder,
        source: "backfill",
        provenance: buildMembershipProvenance({
          method: "backfill",
          source: "lead.projectId",
          notes: "Retained current project as primary; no ordered membership history.",
          appliedAt: new Date(),
          sourceMembershipDate: document.createdAt ?? plan.joinedAt,
          sourceOrder: 0,
        }),
        createdBy: options.actorId,
      });
      result.created += 1;
    }

    afterId = documents[documents.length - 1]!._id.toString();
    if (documents.length < BACKFILL_PAGE_SIZE) {
      break;
    }
  }

  if (!dryRun) {
    await createAuditLog({
      workspaceId: options.workspaceId ?? "000000000000000000000000",
      actorId: options.actorId,
      action: "lead.project_memberships_backfilled",
      entityType: "lead_project_membership",
      entityId: options.workspaceId ?? "all",
      after: {
        scanned: result.scanned,
        created: result.created,
        skipped: result.skipped,
        missingProject: result.missingProject,
        idempotentHits: result.idempotentHits,
        triggerAutomation: false,
      },
    });
  }

  return result;
}
