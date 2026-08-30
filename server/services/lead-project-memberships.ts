import "server-only";

import {
  buildMembershipProvenance,
  planContactProjectMemberships,
  type LeadProjectMembershipProvenance,
  type LeadProjectMembershipSource,
  type NormalizedMembershipPlan,
} from "@/lib/lead-project-membership";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  findActiveLeadByEmailNormalized,
  findLeadById,
  updateLead,
  type LeadRecord,
} from "@/server/repositories/leads";
import {
  archiveMembership,
  createMembership,
  findMembershipById,
  findMembershipByLeadAndProject,
  findMembershipsForLead,
  findMembershipsForLeadIds,
  updateMembership,
  type LeadProjectMembershipRecord,
} from "@/server/repositories/lead-project-memberships";
import { findProjectById } from "@/server/repositories/projects";
import { validateActiveProjectId } from "@/server/services/project-scope";

export type LeadProjectMembershipSummary = LeadProjectMembershipRecord & {
  project: {
    id: string;
    name: string;
    reference: string | null;
  } | null;
};

function membershipSnapshot(record: LeadProjectMembershipRecord): Record<string, unknown> {
  return {
    projectId: record.projectId,
    isPrimary: record.isPrimary,
    joinedAt: record.joinedAt,
    sourceOrder: record.sourceOrder,
    source: record.source,
  };
}

async function resolveProjectSummary(
  workspaceId: string,
  projectId: string,
): Promise<LeadProjectMembershipSummary["project"]> {
  const project = await findProjectById(workspaceId, projectId);
  if (!project) {
    return null;
  }
  return {
    id: project.id,
    name: project.name,
    reference: project.reference,
  };
}

async function enrichMemberships(
  workspaceId: string,
  memberships: LeadProjectMembershipRecord[],
): Promise<LeadProjectMembershipSummary[]> {
  return Promise.all(
    memberships.map(async (membership) => ({
      ...membership,
      project: await resolveProjectSummary(workspaceId, membership.projectId),
    })),
  );
}

async function requireLead(workspaceId: string, leadId: string): Promise<LeadRecord> {
  const lead = await findLeadById(workspaceId, leadId);
  if (!lead) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  return lead;
}

async function assertPrimaryEmailAvailable(
  workspaceId: string,
  lead: LeadRecord,
  nextPrimaryProjectId: string,
): Promise<void> {
  if (!lead.emailNormalized || nextPrimaryProjectId === lead.projectId) {
    return;
  }
  const duplicate = await findActiveLeadByEmailNormalized(
    workspaceId,
    lead.emailNormalized,
    lead.id,
    nextPrimaryProjectId,
  );
  if (duplicate) {
    throw new AppError(
      "CONFLICT",
      "A lead with this email already exists in the target primary project.",
    );
  }
}

async function syncLeadPrimaryProject(
  workspaceId: string,
  lead: LeadRecord,
  primaryProjectId: string,
): Promise<void> {
  if (lead.projectId === primaryProjectId) {
    return;
  }
  await assertPrimaryEmailAvailable(workspaceId, lead, primaryProjectId);
  await updateLead(workspaceId, lead.id, { projectId: primaryProjectId });
}

async function nextSourceOrder(
  memberships: LeadProjectMembershipRecord[],
): Promise<number> {
  if (memberships.length === 0) {
    return 0;
  }
  return Math.max(...memberships.map((item) => item.sourceOrder)) + 1;
}

export async function listLeadProjectMemberships(
  workspaceId: string,
  leadId: string,
): Promise<LeadProjectMembershipSummary[]> {
  await requireLead(workspaceId, leadId);
  const memberships = await findMembershipsForLead(workspaceId, leadId);
  return enrichMemberships(workspaceId, memberships);
}

export async function loadMembershipsByLeadIds(
  workspaceId: string,
  leadIds: string[],
): Promise<Map<string, LeadProjectMembershipSummary[]>> {
  const grouped = await findMembershipsForLeadIds(workspaceId, leadIds);
  const enriched = new Map<string, LeadProjectMembershipSummary[]>();
  for (const [leadId, memberships] of grouped) {
    enriched.set(leadId, await enrichMemberships(workspaceId, memberships));
  }
  return enriched;
}

export async function ensurePrimaryMembershipForLead(input: {
  workspaceId: string;
  leadId: string;
  projectId: string;
  actorId: string;
  source: LeadProjectMembershipSource;
  joinedAt?: Date;
  sourceOrder?: number;
  provenance?: LeadProjectMembershipProvenance | null;
}): Promise<LeadProjectMembershipRecord> {
  const existing = await findMembershipByLeadAndProject(
    input.workspaceId,
    input.leadId,
    input.projectId,
  );
  if (existing) {
    return existing;
  }

  const memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  const isPrimary = memberships.length === 0 || memberships.every((item) => !item.isPrimary);

  const created = await createMembership({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    projectId: input.projectId,
    isPrimary,
    joinedAt: input.joinedAt ?? new Date(),
    sourceOrder: input.sourceOrder ?? (await nextSourceOrder(memberships)),
    source: input.source,
    provenance: input.provenance ?? null,
    createdBy: input.actorId,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_membership_created",
    entityType: "lead_project_membership",
    entityId: created.id,
    after: membershipSnapshot(created),
  });

  return created;
}

export async function addLeadProjectMembership(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  projectId: string;
  isPrimary?: boolean;
  joinedAt?: Date;
  source?: LeadProjectMembershipSource;
  provenance?: LeadProjectMembershipProvenance | null;
}): Promise<LeadProjectMembershipSummary[]> {
  const lead = await requireLead(input.workspaceId, input.leadId);
  if (lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  await validateActiveProjectId(input.workspaceId, input.projectId);

  let memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  if (memberships.length === 0 && lead.projectId) {
    await ensurePrimaryMembershipForLead({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      projectId: lead.projectId,
      actorId: input.actorId,
      source: "backfill",
      joinedAt: lead.createdAt,
      sourceOrder: 0,
      provenance: buildMembershipProvenance({
        method: "backfill",
        source: "lead.projectId",
        notes: "Healed current primary project before adding another membership.",
      }),
    });
    memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  }

  const duplicate = await findMembershipByLeadAndProject(
    input.workspaceId,
    input.leadId,
    input.projectId,
  );
  if (duplicate) {
    throw new AppError("CONFLICT", "This contact is already a member of that project.");
  }
  const makePrimary = input.isPrimary === true || memberships.length === 0;

  if (makePrimary) {
    await assertPrimaryEmailAvailable(input.workspaceId, lead, input.projectId);
    const currentPrimary = memberships.find((item) => item.isPrimary);
    if (currentPrimary) {
      await updateMembership(input.workspaceId, currentPrimary.id, { isPrimary: false });
    }
  }

  let created: LeadProjectMembershipRecord;
  try {
    created = await createMembership({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      projectId: input.projectId,
      isPrimary: makePrimary,
      joinedAt: input.joinedAt ?? new Date(),
      sourceOrder: await nextSourceOrder(memberships),
      source: input.source ?? "manual",
      provenance:
        input.provenance ??
        buildMembershipProvenance({
          method: "manual",
          source: "lead_project_membership_api",
          notes: makePrimary
            ? "Primary membership set deliberately."
            : "Secondary project association. Does not enroll campaigns.",
        }),
      createdBy: input.actorId,
    });
  } catch (error) {
    if (makePrimary) {
      const currentPrimary = memberships.find((item) => item.isPrimary);
      if (currentPrimary) {
        await updateMembership(input.workspaceId, currentPrimary.id, { isPrimary: true });
      }
    }
    throw error;
  }

  if (makePrimary) {
    try {
      await syncLeadPrimaryProject(input.workspaceId, lead, input.projectId);
    } catch (error) {
      await updateMembership(input.workspaceId, created.id, { isPrimary: false });
      const currentPrimary = memberships.find((item) => item.isPrimary);
      if (currentPrimary) {
        await updateMembership(input.workspaceId, currentPrimary.id, { isPrimary: true });
      }
      throw error;
    }
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_membership_created",
    entityType: "lead_project_membership",
    entityId: created.id,
    after: {
      ...membershipSnapshot(created),
      triggerAutomation: false,
    },
  });

  return listLeadProjectMemberships(input.workspaceId, input.leadId);
}

export async function setLeadProjectMembershipPrimary(input: {
  workspaceId: string;
  leadId: string;
  membershipId: string;
  actorId: string;
}): Promise<LeadProjectMembershipSummary[]> {
  const lead = await requireLead(input.workspaceId, input.leadId);
  if (lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const target = await findMembershipById(input.workspaceId, input.membershipId);
  if (!target || target.leadId !== input.leadId) {
    throw new AppError("NOT_FOUND", "Project membership not found.");
  }

  if (target.isPrimary) {
    return listLeadProjectMemberships(input.workspaceId, input.leadId);
  }

  await assertPrimaryEmailAvailable(input.workspaceId, lead, target.projectId);

  const memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  const currentPrimary = memberships.find((item) => item.isPrimary);
  if (currentPrimary) {
    await updateMembership(input.workspaceId, currentPrimary.id, { isPrimary: false });
  }
  try {
    await updateMembership(input.workspaceId, target.id, { isPrimary: true });
    await syncLeadPrimaryProject(input.workspaceId, lead, target.projectId);
  } catch (error) {
    if (currentPrimary) {
      await updateMembership(input.workspaceId, currentPrimary.id, { isPrimary: true });
    }
    await updateMembership(input.workspaceId, target.id, { isPrimary: false });
    throw error;
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_membership_primary_changed",
    entityType: "lead_project_membership",
    entityId: target.id,
    before: currentPrimary ? membershipSnapshot(currentPrimary) : undefined,
    after: {
      projectId: target.projectId,
      isPrimary: true,
      triggerAutomation: false,
    },
  });

  return listLeadProjectMemberships(input.workspaceId, input.leadId);
}

export async function removeLeadProjectMembership(input: {
  workspaceId: string;
  leadId: string;
  membershipId: string;
  actorId: string;
}): Promise<LeadProjectMembershipSummary[]> {
  const lead = await requireLead(input.workspaceId, input.leadId);
  if (lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const target = await findMembershipById(input.workspaceId, input.membershipId);
  if (!target || target.leadId !== input.leadId) {
    throw new AppError("NOT_FOUND", "Project membership not found.");
  }

  const memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  if (memberships.length <= 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A contact must remain a member of at least one project.",
    );
  }
  if (target.isPrimary) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set another project as primary before removing this membership.",
    );
  }

  const archived = await archiveMembership(input.workspaceId, target.id);
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_membership_removed",
    entityType: "lead_project_membership",
    entityId: target.id,
    before: membershipSnapshot(target),
    after: archived ? { archivedAt: archived.archivedAt, isPrimary: false } : undefined,
  });

  return listLeadProjectMemberships(input.workspaceId, input.leadId);
}

export async function reorderLeadProjectMemberships(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  membershipIds: string[];
}): Promise<LeadProjectMembershipSummary[]> {
  const lead = await requireLead(input.workspaceId, input.leadId);
  if (lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const memberships = await findMembershipsForLead(input.workspaceId, input.leadId);
  const byId = new Map(memberships.map((item) => [item.id, item]));
  if (input.membershipIds.length !== memberships.length) {
    throw new AppError("VALIDATION_ERROR", "Reorder must include every project membership.");
  }
  for (const membershipId of input.membershipIds) {
    if (!byId.has(membershipId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown project membership in reorder.");
    }
  }

  const uniqueIds = new Set(input.membershipIds);
  if (uniqueIds.size !== input.membershipIds.length) {
    throw new AppError("CONFLICT", "Duplicate membership ids in reorder.");
  }

  for (const [index, membershipId] of input.membershipIds.entries()) {
    await updateMembership(input.workspaceId, membershipId, { sourceOrder: index });
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_memberships_reordered",
    entityType: "lead",
    entityId: lead.id,
    after: {
      membershipIds: input.membershipIds,
      triggerAutomation: false,
    },
  });

  return listLeadProjectMemberships(input.workspaceId, input.leadId);
}

export async function applyPlannedMembershipsToLead(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  plans: Array<
    NormalizedMembershipPlan & {
      source: LeadProjectMembershipSource;
      provenance?: LeadProjectMembershipProvenance | null;
    }
  >;
}): Promise<LeadProjectMembershipSummary[]> {
  const lead = await requireLead(input.workspaceId, input.leadId);
  const plannedPrimary = input.plans.find((item) => item.isPrimary);
  if (!plannedPrimary) {
    throw new AppError("VALIDATION_ERROR", "Planned memberships must include a primary.");
  }

  await assertPrimaryEmailAvailable(input.workspaceId, lead, plannedPrimary.projectId);

  const existing = await findMembershipsForLead(input.workspaceId, input.leadId);
  const existingPrimary = existing.find((item) => item.isPrimary);
  if (existingPrimary && existingPrimary.projectId !== plannedPrimary.projectId) {
    await updateMembership(input.workspaceId, existingPrimary.id, { isPrimary: false });
  }

  for (const plan of input.plans) {
    await validateActiveProjectId(input.workspaceId, plan.projectId);
    const current = await findMembershipByLeadAndProject(
      input.workspaceId,
      input.leadId,
      plan.projectId,
    );
    if (current) {
      await updateMembership(input.workspaceId, current.id, {
        isPrimary: plan.isPrimary,
        sourceOrder: plan.sourceOrder,
        joinedAt: plan.joinedAt,
      });
      continue;
    }
    await createMembership({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      projectId: plan.projectId,
      isPrimary: plan.isPrimary,
      joinedAt: plan.joinedAt,
      sourceOrder: plan.sourceOrder,
      source: plan.source,
      provenance: plan.provenance ?? null,
      createdBy: input.actorId,
    });
  }

  await syncLeadPrimaryProject(input.workspaceId, lead, plannedPrimary.projectId);

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.project_memberships_applied",
    entityType: "lead",
    entityId: lead.id,
    after: {
      projectIds: input.plans.map((item) => item.projectId),
      primaryProjectId: plannedPrimary.projectId,
      triggerAutomation: false,
    },
  });

  return listLeadProjectMemberships(input.workspaceId, input.leadId);
}

export function planBackfillMembershipsForLead(lead: {
  projectId: string | null;
  createdAt?: Date;
}): ReturnType<typeof planContactProjectMemberships> {
  return planContactProjectMemberships({
    currentProjectId: lead.projectId,
    history: [],
    fallbackNow: lead.createdAt ?? new Date(),
  });
}
