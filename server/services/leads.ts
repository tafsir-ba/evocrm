import "server-only";

import type { LeadActivityEvent } from "@/lib/lead-activity-summary";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findLeadActivitySummaries } from "@/server/repositories/activities";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import {
  archiveLead,
  createLead,
  findActiveLeadByEmailNormalized,
  findLeadById,
  findLeadByPhoneNormalized,
  findLeadIds,
  findLeads,
  restoreLead,
  updateLead,
  type LeadListFilter,
  type LeadRecord,
} from "@/server/repositories/leads";
import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import {
  ensurePrimaryMembershipForLead,
  loadMembershipsByLeadIds,
  type LeadProjectMembershipSummary,
} from "@/server/services/lead-project-memberships";
import { buildMembershipProvenance } from "@/lib/lead-project-membership";
import {
  buildLeadFieldProvenance,
  mergeIntelligenceProvenance,
  normalizeIntelligenceText,
  type LeadFieldProvenanceMethod,
  type LeadIntelligenceProvenance,
} from "@/lib/lead-intelligence";
import { findCompaniesByIds } from "@/server/repositories/companies";
import { purgeLeadsByIds } from "@/server/repositories/lead-deletion";
import { findTagById } from "@/server/repositories/tags";
import { findProjectById } from "@/server/repositories/projects";
import { findUserById } from "@/server/repositories/users";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import {
  evaluateCampaignAutoEnrollmentForLead,
  logAutoEnrollmentFailure,
} from "@/server/services/campaign-auto-enrollment";
import {
  assertValidProjectFilter,
  validateActiveProjectId,
} from "@/server/services/project-scope";
import type {
  BulkDeleteLeadsInput,
  CreateLeadInput,
  UpdateLeadInput,
} from "@/server/validation/leads";

export type LeadDictionarySummary = {
  id: string;
  label: string;
  color: string;
  key: string;
};

export type LeadTagSummary = {
  id: string;
  name: string;
  color: string;
};

export type LeadUserSummary = {
  id: string;
  name: string | null;
  email: string;
};

export type LeadProjectSummary = {
  id: string;
  name: string;
  reference: string | null;
};

export type LeadCompanySummary = {
  id: string;
  name: string;
};

export type LeadListItem = LeadRecord & {
  project: LeadProjectSummary | null;
  projectMemberships?: LeadProjectMembershipSummary[];
  secondaryProjects?: LeadProjectSummary[];
  status: LeadDictionarySummary | null;
  source: LeadDictionarySummary | null;
  tagsResolved: LeadTagSummary[];
  assignedUser: LeadUserSummary | null;
  company: LeadCompanySummary | null;
  lastActivity?: LeadActivityEvent | null;
  nextAction?: LeadActivityEvent | null;
};

export type LeadDetail = LeadListItem & {
  ownerUser: LeadUserSummary | null;
};

export type LeadMutationResult = {
  lead: LeadDetail;
  warnings: string[];
};

function deriveFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

const INTELLIGENCE_TEXT_FIELDS = ["industry", "jobTitle", "stateRegion"] as const;

async function resolveCompanySummary(
  workspaceId: string,
  companyId: string | null | undefined,
): Promise<LeadCompanySummary | null> {
  if (!companyId) {
    return null;
  }
  const found = await findCompaniesByIds(workspaceId, [companyId]);
  const company = found[0];
  return company ? { id: company.id, name: company.name } : null;
}

function stampProvidedIntelligenceProvenance(input: {
  existing?: {
    industry: string | null;
    jobTitle: string | null;
    stateRegion: string | null;
    companyId?: string | null;
    intelligenceProvenance?: LeadIntelligenceProvenance;
  };
  incoming: {
    industry?: string | null;
    jobTitle?: string | null;
    stateRegion?: string | null;
    companyId?: string | null;
  };
  method: LeadFieldProvenanceMethod;
  source: string;
}): LeadIntelligenceProvenance {
  const stamp = buildLeadFieldProvenance({
    method: input.method,
    source: input.source,
    notes: input.method === "manual" ? "Updated from CRM form or API." : null,
  });
  const next: LeadIntelligenceProvenance = { ...(input.existing?.intelligenceProvenance ?? {}) };

  for (const field of INTELLIGENCE_TEXT_FIELDS) {
    if (input.incoming[field] === undefined) {
      continue;
    }
    const incoming = normalizeIntelligenceText(input.incoming[field]);
    const existing = normalizeIntelligenceText(input.existing?.[field] ?? null);
    if (incoming !== existing) {
      next[field] = stamp;
    }
  }

  if (input.incoming.companyId !== undefined) {
    const incoming = input.incoming.companyId;
    const existing = input.existing?.companyId ?? null;
    if (incoming !== existing) {
      next.companyId = stamp;
    }
  }

  return mergeIntelligenceProvenance(input.existing?.intelligenceProvenance, next);
}

export function normalizeLeadEmail(email: string): {
  email: string;
  emailNormalized: string;
} {
  const cleaned = email.trim();
  return {
    email: cleaned,
    emailNormalized: cleaned.toLowerCase(),
  };
}

export function normalizeLeadPhone(phone: string): {
  phone: string;
  phoneNormalized: string;
} {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  const phoneNormalized = hasPlus ? `+${digits}` : digits;
  return { phone: trimmed, phoneNormalized };
}

async function validateLeadStatusId(
  workspaceId: string,
  statusId: string,
  existingStatusId?: string,
): Promise<void> {
  const item = await findDictionaryItemById(workspaceId, statusId);

  if (!item || item.type !== "lead_status") {
    throw new AppError("VALIDATION_ERROR", "Invalid lead status.");
  }

  if (!item.isActive && statusId !== existingStatusId) {
    throw new AppError("VALIDATION_ERROR", "Lead status must be active.");
  }
}

async function validateLeadSourceId(
  workspaceId: string,
  sourceId: string | null | undefined,
  existingSourceId?: string | null,
): Promise<void> {
  if (!sourceId) {
    return;
  }

  const item = await findDictionaryItemById(workspaceId, sourceId);

  if (!item || item.type !== "lead_source") {
    throw new AppError("VALIDATION_ERROR", "Invalid lead source.");
  }

  if (!item.isActive && sourceId !== existingSourceId) {
    throw new AppError("VALIDATION_ERROR", "Lead source must be active.");
  }
}

async function validateLeadTags(
  workspaceId: string,
  tagIds: string[] | undefined,
): Promise<void> {
  if (!tagIds || tagIds.length === 0) {
    return;
  }

  for (const tagId of tagIds) {
    const tag = await findTagById(workspaceId, tagId);

    if (!tag || tag.archivedAt) {
      throw new AppError("VALIDATION_ERROR", "Invalid tag for this workspace.");
    }

    if (!tag.entityTypes.includes("lead")) {
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more tags cannot be assigned to leads.",
      );
    }
  }
}

async function assertUniqueEmail(
  workspaceId: string,
  emailNormalized: string | null | undefined,
  projectId: string,
  excludeLeadId?: string,
): Promise<void> {
  if (!emailNormalized) {
    return;
  }

  const duplicate = await findActiveLeadByEmailNormalized(
    workspaceId,
    emailNormalized,
    excludeLeadId,
    projectId,
  );

  if (duplicate) {
    throw new AppError(
      "CONFLICT",
      "A lead with this email already exists in this project.",
    );
  }
}

async function checkDuplicatePhoneWarning(
  workspaceId: string,
  phoneNormalized: string | null | undefined,
  excludeLeadId?: string,
): Promise<string[]> {
  if (!phoneNormalized) {
    return [];
  }

  const duplicate = await findLeadByPhoneNormalized(
    workspaceId,
    phoneNormalized,
    excludeLeadId,
  );

  return duplicate ? ["duplicate_phone"] : [];
}

async function resolveUserSummary(
  userId: string | null,
): Promise<LeadUserSummary | null> {
  if (!userId) {
    return null;
  }

  const user = await findUserById(userId);

  if (!user) {
    return { id: userId, name: null, email: "" };
  }

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
  };
}

async function resolveDictionarySummary(
  workspaceId: string,
  itemId: string | null,
  type: "lead_status" | "lead_source",
): Promise<LeadDictionarySummary | null> {
  if (!itemId) {
    return null;
  }

  const item = await findDictionaryItemById(workspaceId, itemId);

  if (!item || item.type !== type) {
    return null;
  }

  return {
    id: item.id,
    label: item.label,
    color: item.color,
    key: item.key,
  };
}

async function resolveTagsSummary(
  workspaceId: string,
  tagIds: string[],
): Promise<LeadTagSummary[]> {
  const resolved: LeadTagSummary[] = [];

  for (const tagId of tagIds) {
    const tag = await findTagById(workspaceId, tagId);
    if (tag) {
      resolved.push({ id: tag.id, name: tag.name, color: tag.color });
    }
  }

  return resolved;
}

async function resolveProjectSummary(
  workspaceId: string,
  projectId: string | null,
): Promise<LeadProjectSummary | null> {
  if (!projectId) {
    return null;
  }

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

function secondaryProjectsFromMemberships(
  memberships: LeadProjectMembershipSummary[],
): LeadProjectSummary[] {
  return memberships
    .filter((membership) => !membership.isPrimary && membership.project)
    .map((membership) => membership.project!)
    .filter(
      (project, index, all) => all.findIndex((item) => item.id === project.id) === index,
    );
}

async function enrichLeadListItem(
  lead: LeadRecord,
  memberships: LeadProjectMembershipSummary[] = [],
): Promise<LeadListItem> {
  const [project, status, source, tagsResolved, assignedUser, company] = await Promise.all([
    resolveProjectSummary(lead.workspaceId, lead.projectId),
    resolveDictionarySummary(lead.workspaceId, lead.statusId, "lead_status"),
    resolveDictionarySummary(lead.workspaceId, lead.sourceId, "lead_source"),
    resolveTagsSummary(lead.workspaceId, lead.tags),
    resolveUserSummary(lead.assignedTo),
    resolveCompanySummary(lead.workspaceId, lead.companyId),
  ]);

  return {
    ...lead,
    project,
    projectMemberships: memberships,
    secondaryProjects: secondaryProjectsFromMemberships(memberships),
    status,
    source,
    tagsResolved,
    assignedUser,
    company,
    lastActivity: null,
    nextAction: null,
  };
}

async function enrichLeadRecord(lead: LeadRecord): Promise<LeadDetail> {
  const membershipsByLead = await loadMembershipsByLeadIds(lead.workspaceId, [lead.id]);
  const listItem = await enrichLeadListItem(
    lead,
    membershipsByLead.get(lead.id) ?? [],
  );
  const ownerUser = await resolveUserSummary(lead.ownerId);
  return { ...listItem, ownerUser };
}

function leadSnapshot(lead: LeadRecord): Record<string, unknown> {
  return {
    statusId: lead.statusId,
    sourceId: lead.sourceId,
    ownerId: lead.ownerId,
    assignedTo: lead.assignedTo,
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    tags: lead.tags,
    propertyTypeInterests: lead.propertyTypeInterests,
    transactionIntent: lead.transactionIntent,
    usagePurpose: lead.usagePurpose,
    companyId: lead.companyId ?? null,
    industry: lead.industry,
    jobTitle: lead.jobTitle,
    stateRegion: lead.stateRegion,
  };
}

async function validateOptionalCompanyId(
  workspaceId: string,
  companyId: string | null | undefined,
): Promise<void> {
  if (!companyId) {
    return;
  }

  const found = await findCompaniesByIds(workspaceId, [companyId]);
  if (found.length !== 1) {
    throw new AppError("VALIDATION_ERROR", "Company was not found.");
  }
}

async function resolveListFilter(
  workspaceId: string,
  filter: LeadListFilter,
): Promise<LeadListFilter> {
  if (!filter.projectId || !filter.includeAssociated) {
    return filter;
  }

  const associatedLeadIds = await findLeadIdsForProjectMembership(
    workspaceId,
    filter.projectId,
  );
  const requested = filter.leadIds?.length
    ? associatedLeadIds.filter((id) => filter.leadIds!.includes(id))
    : associatedLeadIds;

  return {
    ...filter,
    associatedLeadIds: requested,
  };
}

export async function listLeadsForWorkspace(
  workspaceId: string,
  filter: LeadListFilter = {},
): Promise<{ leads: LeadListItem[]; total: number }> {
  await assertValidProjectFilter(workspaceId, filter.projectId);
  const listFilter = await resolveListFilter(workspaceId, filter);
  const { leads, total } = await findLeads(workspaceId, listFilter);
  const membershipsByLead = await loadMembershipsByLeadIds(
    workspaceId,
    leads.map((lead) => lead.id),
  );

  const [enriched, activitySummaries] = await Promise.all([
    Promise.all(
      leads.map((lead) =>
        enrichLeadListItem(lead, membershipsByLead.get(lead.id) ?? []),
      ),
    ),
    findLeadActivitySummaries(
      workspaceId,
      leads.map((lead) => lead.id),
    ),
  ]);

  return {
    leads: enriched.map((lead) => {
      const timeline = activitySummaries.get(lead.id);
      return {
        ...lead,
        lastActivity: timeline?.lastActivity ?? null,
        nextAction: timeline?.nextAction ?? null,
      };
    }),
    total,
  };
}

export async function getLeadForWorkspace(
  workspaceId: string,
  leadId: string,
): Promise<LeadDetail> {
  const lead = await findLeadById(workspaceId, leadId);

  if (!lead) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  return enrichLeadRecord(lead);
}

export async function createLeadForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateLeadInput,
  options?: {
    triggerAutomation?: boolean;
    intelligenceMethod?: LeadFieldProvenanceMethod;
    intelligenceSource?: string;
  },
): Promise<LeadMutationResult> {
  await validateActiveProjectId(workspaceId, input.projectId);
  await validateLeadStatusId(workspaceId, input.statusId);
  await validateLeadSourceId(workspaceId, input.sourceId);
  await validateLeadTags(workspaceId, input.tags);
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalAssignableMember(
    workspaceId,
    input.assignedTo,
    "Assigned to",
  );
  await validateOptionalCompanyId(workspaceId, input.companyId);

  const fullName = deriveFullName(input.firstName, input.lastName);
  const emailFields = input.email ? normalizeLeadEmail(input.email) : null;
  const phoneFields = input.phone ? normalizeLeadPhone(input.phone) : null;

  await assertUniqueEmail(
    workspaceId,
    emailFields?.emailNormalized,
    input.projectId,
  );

  const warnings = await checkDuplicatePhoneWarning(
    workspaceId,
    phoneFields?.phoneNormalized,
  );

  const lead = await createLead({
    workspaceId,
    projectId: input.projectId,
    createdBy: actorId,
    statusId: input.statusId,
    sourceId: input.sourceId ?? null,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    firstName: input.firstName,
    lastName: input.lastName,
    fullName,
    email: emailFields?.email ?? null,
    emailNormalized: emailFields?.emailNormalized ?? null,
    phone: phoneFields?.phone ?? null,
    phoneNormalized: phoneFields?.phoneNormalized ?? null,
    language: input.language ?? null,
    preferredContactMethod: input.preferredContactMethod ?? null,
    budgetMin: input.budgetMin ?? null,
    budgetMax: input.budgetMax ?? null,
    preferredAreas: input.preferredAreas ?? [],
    propertyTypeInterests: input.propertyTypeInterests ?? [],
    transactionIntent: input.transactionIntent ?? null,
    usagePurpose: input.usagePurpose ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    attributes: input.attributes ?? {},
    emailConsentStatus: input.emailConsentStatus ?? "unknown",
    companyId: input.companyId ?? null,
    industry: normalizeIntelligenceText(input.industry) ?? null,
    jobTitle: normalizeIntelligenceText(input.jobTitle) ?? null,
    stateRegion: normalizeIntelligenceText(input.stateRegion) ?? null,
    intelligenceProvenance: stampProvidedIntelligenceProvenance({
      incoming: {
        industry: input.industry,
        jobTitle: input.jobTitle,
        stateRegion: input.stateRegion,
        companyId: input.companyId ?? null,
      },
      method: options?.intelligenceMethod ?? "manual",
      source: options?.intelligenceSource ?? "lead_create",
    }),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });

  await ensurePrimaryMembershipForLead({
    workspaceId,
    leadId: lead.id,
    projectId: input.projectId,
    actorId,
    source: "lead_create",
    joinedAt: lead.createdAt,
    sourceOrder: 0,
    provenance: buildMembershipProvenance({
      method: "lead_create",
      source: "lead_create",
      notes: "Primary membership from lead create.",
      appliedAt: lead.createdAt,
      sourceMembershipDate: lead.createdAt,
      sourceOrder: 0,
    }),
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    after: leadSnapshot(lead),
  });

  if (options?.triggerAutomation !== false) {
    try {
      await evaluateCampaignAutoEnrollmentForLead({
        workspaceId,
        leadId: lead.id,
        trigger: "new_lead",
        actorId,
      });
    } catch (error) {
      logAutoEnrollmentFailure(
        {
          workspaceId,
          leadId: lead.id,
          trigger: "new_lead",
          actorId,
        },
        error,
      );
    }
  }

  return {
    lead: await enrichLeadRecord(lead),
    warnings,
  };
}

export async function updateLeadForWorkspace(
  workspaceId: string,
  leadId: string,
  actorId: string,
  input: UpdateLeadInput,
  options?: {
    triggerAutomation?: boolean;
    intelligenceMethod?: LeadFieldProvenanceMethod;
    intelligenceSource?: string;
  },
): Promise<LeadMutationResult> {
  const existing = await findLeadById(workspaceId, leadId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  if (input.statusId !== undefined) {
    await validateLeadStatusId(workspaceId, input.statusId, existing.statusId);
  }
  if (input.sourceId !== undefined) {
    await validateLeadSourceId(workspaceId, input.sourceId, existing.sourceId);
  }
  if (input.tags !== undefined) {
    await validateLeadTags(workspaceId, input.tags);
  }
  if (input.ownerId !== undefined) {
    await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  }
  if (input.assignedTo !== undefined) {
    await validateOptionalAssignableMember(
      workspaceId,
      input.assignedTo,
      "Assigned to",
    );
  }
  if (input.companyId !== undefined) {
    await validateOptionalCompanyId(workspaceId, input.companyId);
  }

  const updatePayload: Parameters<typeof updateLead>[2] = {};
  const warnings: string[] = [];

  if (input.firstName !== undefined) {
    updatePayload.firstName = input.firstName.trim();
  }
  if (input.lastName !== undefined) {
    updatePayload.lastName = input.lastName.trim();
  }
  if (input.firstName !== undefined || input.lastName !== undefined) {
    updatePayload.fullName = deriveFullName(
      input.firstName ?? existing.firstName,
      input.lastName ?? existing.lastName,
    );
  }

  if (input.email !== undefined) {
    if (input.email === null || input.email === "") {
      updatePayload.email = null;
      updatePayload.emailNormalized = null;
    } else {
      if (!existing.projectId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Lead must belong to a project before email can be updated.",
        );
      }

      const emailFields = normalizeLeadEmail(input.email);
      await assertUniqueEmail(
        workspaceId,
        emailFields.emailNormalized,
        existing.projectId,
        leadId,
      );
      updatePayload.email = emailFields.email;
      updatePayload.emailNormalized = emailFields.emailNormalized;
    }
  }

  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      updatePayload.phone = null;
      updatePayload.phoneNormalized = null;
    } else {
      const phoneFields = normalizeLeadPhone(input.phone);
      updatePayload.phone = phoneFields.phone;
      updatePayload.phoneNormalized = phoneFields.phoneNormalized;
      warnings.push(
        ...(await checkDuplicatePhoneWarning(
          workspaceId,
          phoneFields.phoneNormalized,
          leadId,
        )),
      );
    }
  }

  if (input.statusId !== undefined) {
    updatePayload.statusId = input.statusId;
  }
  if (input.sourceId !== undefined) {
    updatePayload.sourceId = input.sourceId;
  }
  if (input.ownerId !== undefined) {
    updatePayload.ownerId = input.ownerId;
  }
  if (input.assignedTo !== undefined) {
    updatePayload.assignedTo = input.assignedTo;
  }
  if (input.language !== undefined) {
    updatePayload.language = input.language;
  }
  if (input.preferredContactMethod !== undefined) {
    updatePayload.preferredContactMethod = input.preferredContactMethod;
  }
  if (input.budgetMin !== undefined) {
    updatePayload.budgetMin = input.budgetMin;
  }
  if (input.budgetMax !== undefined) {
    updatePayload.budgetMax = input.budgetMax;
  }
  if (input.preferredAreas !== undefined) {
    updatePayload.preferredAreas = input.preferredAreas;
  }
  if (input.propertyTypeInterests !== undefined) {
    updatePayload.propertyTypeInterests = input.propertyTypeInterests;
  }
  if (input.transactionIntent !== undefined) {
    updatePayload.transactionIntent = input.transactionIntent;
  }
  if (input.usagePurpose !== undefined) {
    updatePayload.usagePurpose = input.usagePurpose;
  }
  if (input.notes !== undefined) {
    updatePayload.notes = input.notes;
  }
  if (input.tags !== undefined) {
    updatePayload.tags = input.tags;
  }
  if (input.attributes !== undefined) {
    updatePayload.attributes = input.attributes;
  }
  if (input.emailConsentStatus !== undefined) {
    updatePayload.emailConsentStatus = input.emailConsentStatus;
  }
  if (input.emailUnsubscribedAt !== undefined) {
    updatePayload.emailUnsubscribedAt = input.emailUnsubscribedAt;
  }
  if (input.emailUnsubscribeReason !== undefined) {
    updatePayload.emailUnsubscribeReason = input.emailUnsubscribeReason;
  }
  if (input.companyId !== undefined) {
    updatePayload.companyId = input.companyId;
  }
  if (input.industry !== undefined) {
    updatePayload.industry = normalizeIntelligenceText(input.industry);
  }
  if (input.jobTitle !== undefined) {
    updatePayload.jobTitle = normalizeIntelligenceText(input.jobTitle);
  }
  if (input.stateRegion !== undefined) {
    updatePayload.stateRegion = normalizeIntelligenceText(input.stateRegion);
  }
  if (
    input.industry !== undefined ||
    input.jobTitle !== undefined ||
    input.stateRegion !== undefined ||
    input.companyId !== undefined
  ) {
    updatePayload.intelligenceProvenance = stampProvidedIntelligenceProvenance({
      existing,
      incoming: {
        industry: input.industry,
        jobTitle: input.jobTitle,
        stateRegion: input.stateRegion,
        companyId: input.companyId,
      },
      method: options?.intelligenceMethod ?? "manual",
      source: options?.intelligenceSource ?? "lead_update",
    });
  }

  const updated = await updateLead(workspaceId, leadId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const auditActions: Array<{ action: string; before?: Record<string, unknown>; after?: Record<string, unknown> }> = [
    {
      action: "lead.updated",
      before: leadSnapshot(existing),
      after: leadSnapshot(updated),
    },
  ];

  if (input.statusId !== undefined && input.statusId !== existing.statusId) {
    auditActions.push({
      action: "lead.status_changed",
      before: { statusId: existing.statusId },
      after: { statusId: updated.statusId },
    });
  }

  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
    auditActions.push({
      action: "lead.assigned",
      before: { assignedTo: existing.assignedTo },
      after: { assignedTo: updated.assignedTo },
    });
  }

  if (input.tags !== undefined) {
    auditActions.push({
      action: "lead.tags_updated",
      before: { tags: existing.tags },
      after: { tags: updated.tags },
    });
  }

  for (const entry of auditActions) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: entry.action,
      entityType: "lead",
      entityId: leadId,
      before: entry.before,
      after: entry.after,
    });
  }

  if (options?.triggerAutomation !== false) {
    try {
      await evaluateCampaignAutoEnrollmentForLead({
        workspaceId,
        leadId,
        trigger: "lead_updated",
        actorId,
      });
    } catch (error) {
      logAutoEnrollmentFailure(
        {
          workspaceId,
          leadId,
          trigger: "lead_updated",
          actorId,
        },
        error,
      );
    }
  }

  return {
    lead: await enrichLeadRecord(updated),
    warnings,
  };
}

export async function archiveLeadForWorkspace(
  workspaceId: string,
  leadId: string,
  actorId: string,
): Promise<LeadDetail> {
  const existing = await findLeadById(workspaceId, leadId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const archived = await archiveLead(workspaceId, leadId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "lead.archived",
    entityType: "lead",
    entityId: leadId,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt },
  });

  return enrichLeadRecord(archived);
}

export async function restoreLeadForWorkspace(
  workspaceId: string,
  leadId: string,
  actorId: string,
): Promise<LeadDetail> {
  const existing = await findLeadById(workspaceId, leadId);

  if (!existing || !existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Archived lead not found.");
  }

  if (existing.projectId && existing.emailNormalized) {
    await assertUniqueEmail(
      workspaceId,
      existing.emailNormalized,
      existing.projectId,
      leadId,
    );
  }

  const restored = await restoreLead(workspaceId, leadId);

  if (!restored) {
    throw new AppError("NOT_FOUND", "Archived lead not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "lead.restored",
    entityType: "lead",
    entityId: leadId,
    before: { archivedAt: existing.archivedAt },
    after: { archivedAt: null },
  });

  return enrichLeadRecord(restored);
}

function buildBulkDeleteLeadFilter(
  input: BulkDeleteLeadsInput,
): LeadListFilter {
  const filters = input.filters ?? {};

  return {
    includeArchived: filters.includeArchived,
    search: filters.search,
    projectId: filters.projectId,
    includeAssociated: filters.includeAssociated,
    statusId: filters.statusId,
    sourceId: filters.sourceId,
    assignedTo: filters.assignedTo,
    ownerId: filters.ownerId,
    tagId: filters.tagId,
    propertyTypeInterest: filters.propertyTypeInterest,
    transactionIntent: filters.transactionIntent,
    usagePurpose: filters.usagePurpose,
    integrationId: filters.integrationId,
    utmCampaign: filters.utmCampaign,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    acquisition: filters.acquisition,
    excludeIds: input.excludeLeadIds,
  };
}

export async function purgeLeadsForWorkspace(
  workspaceId: string,
  actorId: string,
  input: BulkDeleteLeadsInput,
): Promise<{ deletedCount: number; requestedCount: number }> {
  const leadIds = input.selectAll
    ? await findLeadIds(
        workspaceId,
        await resolveListFilter(workspaceId, buildBulkDeleteLeadFilter(input)),
      )
    : await findLeadIds(workspaceId, {
        leadIds: input.leadIds ?? [],
        includeArchived: true,
      });

  const requestedCount = input.selectAll
    ? leadIds.length
    : input.leadIds?.length ?? 0;

  if (leadIds.length === 0) {
    return { deletedCount: 0, requestedCount };
  }

  const deletedCount = await purgeLeadsByIds(workspaceId, leadIds);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "lead.bulk_deleted",
    entityType: "lead",
    entityId: leadIds[0] ?? workspaceId,
    after: {
      deletedCount,
      requestedCount,
      leadIds: leadIds.slice(0, 25),
      selectAll: input.selectAll === true,
    },
  });

  return { deletedCount, requestedCount };
}
