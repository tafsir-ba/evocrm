import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import {
  archiveLead,
  createLead,
  findActiveLeadByEmailNormalized,
  findLeadById,
  findLeadByPhoneNormalized,
  findLeads,
  updateLead,
  type LeadListFilter,
  type LeadRecord,
} from "@/server/repositories/leads";
import { findTagById } from "@/server/repositories/tags";
import { findProjectById } from "@/server/repositories/projects";
import { findUserById } from "@/server/repositories/users";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import { scheduleCampaignAutoEnrollmentForLead } from "@/server/services/campaign-auto-enrollment";
import {
  assertValidProjectFilter,
  validateActiveProjectId,
} from "@/server/services/project-scope";
import type { CreateLeadInput, UpdateLeadInput } from "@/server/validation/leads";

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

export type LeadListItem = LeadRecord & {
  project: LeadProjectSummary | null;
  status: LeadDictionarySummary | null;
  source: LeadDictionarySummary | null;
  tagsResolved: LeadTagSummary[];
  assignedUser: LeadUserSummary | null;
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
  excludeLeadId?: string,
): Promise<void> {
  if (!emailNormalized) {
    return;
  }

  const duplicate = await findActiveLeadByEmailNormalized(
    workspaceId,
    emailNormalized,
    excludeLeadId,
  );

  if (duplicate) {
    throw new AppError(
      "CONFLICT",
      "A lead with this email already exists in this workspace.",
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
  projectId: string,
): Promise<LeadProjectSummary | null> {
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

async function enrichLeadListItem(lead: LeadRecord): Promise<LeadListItem> {
  const [project, status, source, tagsResolved, assignedUser] = await Promise.all([
    resolveProjectSummary(lead.workspaceId, lead.projectId),
    resolveDictionarySummary(lead.workspaceId, lead.statusId, "lead_status"),
    resolveDictionarySummary(lead.workspaceId, lead.sourceId, "lead_source"),
    resolveTagsSummary(lead.workspaceId, lead.tags),
    resolveUserSummary(lead.assignedTo),
  ]);

  return {
    ...lead,
    project,
    status,
    source,
    tagsResolved,
    assignedUser,
  };
}

async function enrichLeadRecord(lead: LeadRecord): Promise<LeadDetail> {
  const listItem = await enrichLeadListItem(lead);
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
  };
}

export async function listLeadsForWorkspace(
  workspaceId: string,
  filter: LeadListFilter = {},
): Promise<{ leads: LeadListItem[]; total: number }> {
  await assertValidProjectFilter(workspaceId, filter.projectId);
  const { leads, total } = await findLeads(workspaceId, filter);

  const enriched = await Promise.all(leads.map((lead) => enrichLeadListItem(lead)));

  return { leads: enriched, total };
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

  const fullName = deriveFullName(input.firstName, input.lastName);
  const emailFields = input.email ? normalizeLeadEmail(input.email) : null;
  const phoneFields = input.phone ? normalizeLeadPhone(input.phone) : null;

  await assertUniqueEmail(workspaceId, emailFields?.emailNormalized);

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
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    after: leadSnapshot(lead),
  });

  scheduleCampaignAutoEnrollmentForLead({
    workspaceId,
    leadId: lead.id,
    trigger: "new_lead",
    actorId,
  });

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
      const emailFields = normalizeLeadEmail(input.email);
      await assertUniqueEmail(
        workspaceId,
        emailFields.emailNormalized,
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

  scheduleCampaignAutoEnrollmentForLead({
    workspaceId,
    leadId,
    trigger: "lead_updated",
    actorId,
  });

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
