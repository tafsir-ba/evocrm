import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import type { DictionaryItemRecord } from "@/server/repositories/dictionary-items";
import { findLeadById, findLeads } from "@/server/repositories/leads";
import { findMembership } from "@/server/repositories/memberships";
import {
  archiveOpportunity,
  createOpportunity,
  findAllOpportunities,
  findOpportunities,
  findOpportunityById,
  updateOpportunity,
  type OpportunityListFilter,
  type OpportunityRecord,
} from "@/server/repositories/opportunities";
import { findProperties, findPropertyById } from "@/server/repositories/properties";
import { findTagById } from "@/server/repositories/tags";
import { findUserById } from "@/server/repositories/users";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import type {
  CreateOpportunityInput,
  StageOpportunityInput,
  UpdateOpportunityInput,
} from "@/server/validation/opportunities";

export type OpportunityDictionarySummary = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
  defaultProbability?: number;
  order?: number;
};

export type OpportunityTagSummary = {
  id: string;
  name: string;
  color: string;
};

export type OpportunityUserSummary = {
  id: string;
  name: string | null;
  email: string;
};

export type OpportunityLeadSummary = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
};

export type OpportunityPropertySummary = {
  id: string;
  title: string;
  reference: string | null;
  price: number | null;
  currency: string;
};

export type OpportunityListItem = OpportunityRecord & {
  status: OpportunityDictionarySummary | null;
  lostReason: OpportunityDictionarySummary | null;
  lead: OpportunityLeadSummary | null;
  property: OpportunityPropertySummary | null;
  tagsResolved: OpportunityTagSummary[];
  assignedUser: OpportunityUserSummary | null;
};

export type OpportunityDetail = OpportunityListItem & {
  ownerUser: OpportunityUserSummary | null;
};

export type StatusBehaviorSideEffects = {
  closedAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReasonId: string | null;
  lostReasonText: string | null;
  probability: number | null;
};

export function applyOpportunityStatusBehavior(
  status: Pick<DictionaryItemRecord, "behavior" | "defaultProbability">,
  options: {
    lostReasonId?: string | null;
    lostReasonText?: string | null;
  } = {},
): StatusBehaviorSideEffects {
  const now = new Date();

  if (status.behavior === "terminal_won") {
    return {
      closedAt: now,
      wonAt: now,
      lostAt: null,
      lostReasonId: null,
      lostReasonText: null,
      probability: status.defaultProbability ?? 100,
    };
  }

  if (status.behavior === "terminal_lost") {
    return {
      closedAt: now,
      lostAt: now,
      wonAt: null,
      lostReasonId: options.lostReasonId ?? null,
      lostReasonText: options.lostReasonText ?? null,
      probability: status.defaultProbability ?? 0,
    };
  }

  return {
    closedAt: null,
    wonAt: null,
    lostAt: null,
    lostReasonId: null,
    lostReasonText: null,
    probability: status.defaultProbability ?? null,
  };
}

async function validateOptionalWorkspaceMember(
  workspaceId: string,
  userId: string | null | undefined,
  fieldLabel: string,
): Promise<void> {
  if (!userId) {
    return;
  }

  const membership = await findMembership(userId, workspaceId);

  if (!membership || membership.status !== "active") {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldLabel} must refer to an active workspace member.`,
    );
  }
}

async function validateOpportunityStatusId(
  workspaceId: string,
  statusId: string,
  existingStatusId?: string,
): Promise<DictionaryItemRecord> {
  const item = await findDictionaryItemById(workspaceId, statusId);

  if (!item || item.type !== "opportunity_status") {
    throw new AppError("VALIDATION_ERROR", "Invalid opportunity status.");
  }

  if (!item.isActive && statusId !== existingStatusId) {
    throw new AppError("VALIDATION_ERROR", "Opportunity status must be active.");
  }

  return item;
}

async function validateLostReasonId(
  workspaceId: string,
  lostReasonId: string | null | undefined,
  existingLostReasonId?: string | null,
): Promise<void> {
  if (!lostReasonId) {
    return;
  }

  const item = await findDictionaryItemById(workspaceId, lostReasonId);

  if (!item || item.type !== "lost_reason") {
    throw new AppError("VALIDATION_ERROR", "Invalid lost reason.");
  }

  if (!item.isActive && lostReasonId !== existingLostReasonId) {
    throw new AppError("VALIDATION_ERROR", "Lost reason must be active.");
  }
}

async function validateLeadForOpportunity(
  workspaceId: string,
  leadId: string,
): Promise<void> {
  const lead = await findLeadById(workspaceId, leadId);

  if (!lead || lead.archivedAt) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Lead must exist in this workspace and not be archived.",
    );
  }
}

async function validatePropertyForOpportunity(
  workspaceId: string,
  propertyId: string,
): Promise<{ currency: string }> {
  const property = await findPropertyById(workspaceId, propertyId);

  if (!property || property.archivedAt) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Property must exist in this workspace and not be archived.",
    );
  }

  return { currency: property.currency };
}

async function validateOpportunityTags(
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

    if (!tag.entityTypes.includes("opportunity")) {
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more tags cannot be assigned to opportunities.",
      );
    }
  }
}

async function resolveDefaultCurrency(
  workspaceId: string,
  inputCurrency: string | undefined,
  propertyId: string,
): Promise<string> {
  if (inputCurrency) {
    return inputCurrency.toUpperCase();
  }

  const property = await findPropertyById(workspaceId, propertyId);
  if (property?.currency) {
    return property.currency;
  }

  const workspace = await findWorkspaceById(workspaceId);
  return workspace?.defaultCurrency ?? "USD";
}

async function resolveUserSummary(
  userId: string | null,
): Promise<OpportunityUserSummary | null> {
  if (!userId) {
    return null;
  }

  const user = await findUserById(userId);
  if (!user) {
    return null;
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
  expectedType: "opportunity_status" | "lost_reason",
): Promise<OpportunityDictionarySummary | null> {
  if (!itemId) {
    return null;
  }

  const item = await findDictionaryItemById(workspaceId, itemId);
  if (!item || item.type !== expectedType) {
    return null;
  }

  return {
    id: item.id,
    label: item.label,
    color: item.color,
    key: item.key,
    behavior: item.behavior,
    defaultProbability: item.defaultProbability,
    order: item.order,
  };
}

async function resolveLeadSummary(
  workspaceId: string,
  leadId: string,
): Promise<OpportunityLeadSummary | null> {
  const lead = await findLeadById(workspaceId, leadId);
  if (!lead) {
    return null;
  }

  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
  };
}

async function resolvePropertySummary(
  workspaceId: string,
  propertyId: string,
): Promise<OpportunityPropertySummary | null> {
  const property = await findPropertyById(workspaceId, propertyId);
  if (!property) {
    return null;
  }

  return {
    id: property.id,
    title: property.title,
    reference: property.reference,
    price: property.price,
    currency: property.currency,
  };
}

async function resolveTagsSummary(
  workspaceId: string,
  tagIds: string[],
): Promise<OpportunityTagSummary[]> {
  const resolved: OpportunityTagSummary[] = [];

  for (const tagId of tagIds) {
    const tag = await findTagById(workspaceId, tagId);
    if (tag) {
      resolved.push({ id: tag.id, name: tag.name, color: tag.color });
    }
  }

  return resolved;
}

async function enrichOpportunityListItem(
  opportunity: OpportunityRecord,
): Promise<OpportunityListItem> {
  const [status, lostReason, lead, property, tagsResolved, assignedUser] =
    await Promise.all([
      resolveDictionarySummary(
        opportunity.workspaceId,
        opportunity.statusId,
        "opportunity_status",
      ),
      resolveDictionarySummary(
        opportunity.workspaceId,
        opportunity.lostReasonId,
        "lost_reason",
      ),
      resolveLeadSummary(opportunity.workspaceId, opportunity.leadId),
      resolvePropertySummary(opportunity.workspaceId, opportunity.propertyId),
      resolveTagsSummary(opportunity.workspaceId, opportunity.tags),
      resolveUserSummary(opportunity.assignedTo),
    ]);

  return {
    ...opportunity,
    status,
    lostReason,
    lead,
    property,
    tagsResolved,
    assignedUser,
  };
}

async function enrichOpportunityRecord(
  opportunity: OpportunityRecord,
): Promise<OpportunityDetail> {
  const listItem = await enrichOpportunityListItem(opportunity);
  const ownerUser = await resolveUserSummary(opportunity.ownerId);
  return { ...listItem, ownerUser };
}

function opportunitySnapshot(opportunity: OpportunityRecord): Record<string, unknown> {
  return {
    leadId: opportunity.leadId,
    propertyId: opportunity.propertyId,
    statusId: opportunity.statusId,
    ownerId: opportunity.ownerId,
    assignedTo: opportunity.assignedTo,
    value: opportunity.value,
    currency: opportunity.currency,
    probability: opportunity.probability,
    expectedCloseDate: opportunity.expectedCloseDate,
    lostReasonId: opportunity.lostReasonId,
    lostReasonText: opportunity.lostReasonText,
    closedAt: opportunity.closedAt,
    wonAt: opportunity.wonAt,
    lostAt: opportunity.lostAt,
    notes: opportunity.notes,
    tags: opportunity.tags,
  };
}

async function resolveSearchFilters(
  workspaceId: string,
  search: string | undefined,
): Promise<Pick<OpportunityListFilter, "search" | "searchLeadIds" | "searchPropertyIds">> {
  if (!search) {
    return {};
  }

  const [{ leads }, { properties }] = await Promise.all([
    findLeads(workspaceId, { search, page: 1, pageSize: 100 }),
    findProperties(workspaceId, { search, page: 1, pageSize: 100 }),
  ]);

  return {
    search,
    searchLeadIds: leads.map((lead) => lead.id),
    searchPropertyIds: properties.map((property) => property.id),
  };
}

async function resolveBehaviorStatusIds(
  workspaceId: string,
  behavior: string | undefined,
): Promise<string[] | undefined> {
  if (!behavior) {
    return undefined;
  }

  const items = await listDictionaryItemsForWorkspace(workspaceId, {
    type: "opportunity_status",
  });

  return items
    .filter((item) => item.behavior === behavior)
    .map((item) => item.id);
}

export type OpportunityListServiceFilter = OpportunityListFilter & {
  behavior?: string;
};

async function buildListFilter(
  workspaceId: string,
  filter: OpportunityListServiceFilter,
): Promise<OpportunityListFilter> {
  const searchFilters = await resolveSearchFilters(workspaceId, filter.search);
  const statusIdsFromBehavior = filter.behavior
    ? await resolveBehaviorStatusIds(workspaceId, filter.behavior)
    : undefined;

  const { behavior: _behavior, ...repoFilter } = filter;

  return {
    ...repoFilter,
    ...searchFilters,
    search: searchFilters.search,
    statusIds: statusIdsFromBehavior,
  };
}

export async function listOpportunitiesForWorkspace(
  workspaceId: string,
  filter: OpportunityListServiceFilter = {},
): Promise<{ opportunities: OpportunityListItem[]; total: number }> {
  const resolvedFilter = await buildListFilter(workspaceId, filter);
  const { opportunities, total } = await findOpportunities(workspaceId, resolvedFilter);

  const enriched = await Promise.all(
    opportunities.map((opportunity) => enrichOpportunityListItem(opportunity)),
  );

  return { opportunities: enriched, total };
}

export async function getOpportunityForWorkspace(
  workspaceId: string,
  opportunityId: string,
): Promise<OpportunityDetail> {
  const opportunity = await findOpportunityById(workspaceId, opportunityId);

  if (!opportunity) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  return enrichOpportunityRecord(opportunity);
}

export async function createOpportunityForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateOpportunityInput,
): Promise<OpportunityDetail> {
  await validateLeadForOpportunity(workspaceId, input.leadId);
  await validatePropertyForOpportunity(workspaceId, input.propertyId);
  const status = await validateOpportunityStatusId(workspaceId, input.statusId);
  await validateOptionalWorkspaceMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalWorkspaceMember(workspaceId, input.assignedTo, "Assignee");
  await validateOpportunityTags(workspaceId, input.tags);

  if (status.behavior === "terminal_lost" && !input.lostReasonId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Lost reason is required when creating an opportunity with a lost status.",
    );
  }

  if (input.lostReasonId) {
    await validateLostReasonId(workspaceId, input.lostReasonId);
  }

  const currency = await resolveDefaultCurrency(
    workspaceId,
    input.currency,
    input.propertyId,
  );

  const behaviorEffects = applyOpportunityStatusBehavior(status, {
    lostReasonId: input.lostReasonId ?? null,
    lostReasonText: input.lostReasonText ?? null,
  });

  const opportunity = await createOpportunity({
    workspaceId,
    leadId: input.leadId,
    propertyId: input.propertyId,
    statusId: input.statusId,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    value: input.value ?? null,
    currency,
    probability: behaviorEffects.probability,
    expectedCloseDate: input.expectedCloseDate ?? null,
    lostReasonId: behaviorEffects.lostReasonId,
    lostReasonText: behaviorEffects.lostReasonText,
    closedAt: behaviorEffects.closedAt,
    wonAt: behaviorEffects.wonAt,
    lostAt: behaviorEffects.lostAt,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    createdBy: actorId,
  });

  const detail = await enrichOpportunityRecord(opportunity);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "opportunity.created",
    entityType: "opportunity",
    entityId: opportunity.id,
    after: opportunitySnapshot(opportunity),
  });

  return detail;
}

export async function updateOpportunityForWorkspace(
  workspaceId: string,
  opportunityId: string,
  actorId: string,
  input: UpdateOpportunityInput,
): Promise<OpportunityDetail> {
  const existing = await findOpportunityById(workspaceId, opportunityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  if (input.leadId) {
    await validateLeadForOpportunity(workspaceId, input.leadId);
  }
  if (input.propertyId) {
    await validatePropertyForOpportunity(workspaceId, input.propertyId);
  }

  let statusItem: DictionaryItemRecord | null = null;
  if (input.statusId) {
    statusItem = await validateOpportunityStatusId(
      workspaceId,
      input.statusId,
      existing.statusId,
    );
  }

  await validateOptionalWorkspaceMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalWorkspaceMember(workspaceId, input.assignedTo, "Assignee");
  await validateOpportunityTags(workspaceId, input.tags);

  const targetStatus = statusItem;
  if (targetStatus?.behavior === "terminal_lost") {
    const lostReasonId =
      input.lostReasonId !== undefined ? input.lostReasonId : existing.lostReasonId;
    if (!lostReasonId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Lost reason is required when status is lost.",
      );
    }
  }

  if (input.lostReasonId) {
    await validateLostReasonId(
      workspaceId,
      input.lostReasonId,
      existing.lostReasonId,
    );
  }

  const updatePayload: Parameters<typeof updateOpportunity>[2] = {};

  if (input.leadId !== undefined) updatePayload.leadId = input.leadId;
  if (input.propertyId !== undefined) updatePayload.propertyId = input.propertyId;
  if (input.ownerId !== undefined) updatePayload.ownerId = input.ownerId;
  if (input.assignedTo !== undefined) updatePayload.assignedTo = input.assignedTo;
  if (input.value !== undefined) updatePayload.value = input.value;
  if (input.currency !== undefined) updatePayload.currency = input.currency.toUpperCase();
  if (input.expectedCloseDate !== undefined) {
    updatePayload.expectedCloseDate = input.expectedCloseDate;
  }
  if (input.notes !== undefined) updatePayload.notes = input.notes;
  if (input.tags !== undefined) updatePayload.tags = input.tags;

  if (targetStatus) {
    const behaviorEffects = applyOpportunityStatusBehavior(targetStatus, {
      lostReasonId:
        input.lostReasonId !== undefined ? input.lostReasonId : existing.lostReasonId,
      lostReasonText:
        input.lostReasonText !== undefined
          ? input.lostReasonText
          : existing.lostReasonText,
    });

    updatePayload.statusId = input.statusId;
    updatePayload.closedAt = behaviorEffects.closedAt;
    updatePayload.wonAt = behaviorEffects.wonAt;
    updatePayload.lostAt = behaviorEffects.lostAt;
    updatePayload.lostReasonId = behaviorEffects.lostReasonId;
    updatePayload.lostReasonText = behaviorEffects.lostReasonText;
    updatePayload.probability = behaviorEffects.probability;
  } else {
    if (input.lostReasonId !== undefined) {
      updatePayload.lostReasonId = input.lostReasonId;
    }
    if (input.lostReasonText !== undefined) {
      updatePayload.lostReasonText = input.lostReasonText;
    }
  }

  const updated = await updateOpportunity(workspaceId, opportunityId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  const detail = await enrichOpportunityRecord(updated);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "opportunity.updated",
    entityType: "opportunity",
    entityId: updated.id,
    before: opportunitySnapshot(existing),
    after: opportunitySnapshot(updated),
  });

  if (input.statusId && input.statusId !== existing.statusId) {
    const action =
      targetStatus?.behavior === "terminal_won"
        ? "opportunity.won"
        : targetStatus?.behavior === "terminal_lost"
          ? "opportunity.lost"
          : "opportunity.stage_changed";

    await createAuditLog({
      workspaceId,
      actorId,
      action,
      entityType: "opportunity",
      entityId: updated.id,
      before: { statusId: existing.statusId },
      after: { statusId: updated.statusId },
    });
  }

  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: "opportunity.assigned",
      entityType: "opportunity",
      entityId: updated.id,
      before: { assignedTo: existing.assignedTo },
      after: { assignedTo: updated.assignedTo },
    });
  }

  if (input.tags !== undefined) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: "opportunity.tags_updated",
      entityType: "opportunity",
      entityId: updated.id,
      before: { tags: existing.tags },
      after: { tags: updated.tags },
    });
  }

  if (
    (input.leadId !== undefined && input.leadId !== existing.leadId) ||
    (input.propertyId !== undefined && input.propertyId !== existing.propertyId)
  ) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: "opportunity.relationship_changed",
      entityType: "opportunity",
      entityId: updated.id,
      before: { leadId: existing.leadId, propertyId: existing.propertyId },
      after: { leadId: updated.leadId, propertyId: updated.propertyId },
    });
  }

  return detail;
}

export async function moveOpportunityStageForWorkspace(
  workspaceId: string,
  opportunityId: string,
  actorId: string,
  input: StageOpportunityInput,
): Promise<OpportunityDetail> {
  const existing = await findOpportunityById(workspaceId, opportunityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  const status = await validateOpportunityStatusId(
    workspaceId,
    input.statusId,
    existing.statusId,
  );

  if (status.behavior === "terminal_lost" && !input.lostReasonId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Lost reason is required when moving to a lost status.",
    );
  }

  if (input.lostReasonId) {
    await validateLostReasonId(workspaceId, input.lostReasonId);
  }

  const behaviorEffects = applyOpportunityStatusBehavior(status, {
    lostReasonId: input.lostReasonId ?? null,
    lostReasonText: input.lostReasonText ?? null,
  });

  const updated = await updateOpportunity(workspaceId, opportunityId, {
    statusId: input.statusId,
    closedAt: behaviorEffects.closedAt,
    wonAt: behaviorEffects.wonAt,
    lostAt: behaviorEffects.lostAt,
    lostReasonId: behaviorEffects.lostReasonId,
    lostReasonText: behaviorEffects.lostReasonText,
    probability: behaviorEffects.probability,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  const detail = await enrichOpportunityRecord(updated);

  const action =
    status.behavior === "terminal_won"
      ? "opportunity.won"
      : status.behavior === "terminal_lost"
        ? "opportunity.lost"
        : "opportunity.stage_changed";

  await createAuditLog({
    workspaceId,
    actorId,
    action,
    entityType: "opportunity",
    entityId: updated.id,
    before: {
      statusId: existing.statusId,
      closedAt: existing.closedAt,
      wonAt: existing.wonAt,
      lostAt: existing.lostAt,
    },
    after: {
      statusId: updated.statusId,
      closedAt: updated.closedAt,
      wonAt: updated.wonAt,
      lostAt: updated.lostAt,
      probability: updated.probability,
    },
  });

  return detail;
}

export async function archiveOpportunityForWorkspace(
  workspaceId: string,
  opportunityId: string,
  actorId: string,
): Promise<OpportunityDetail> {
  const existing = await findOpportunityById(workspaceId, opportunityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  const archived = await archiveOpportunity(workspaceId, opportunityId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Opportunity not found.");
  }

  const detail = await enrichOpportunityRecord(archived);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "opportunity.archived",
    entityType: "opportunity",
    entityId: archived.id,
    before: opportunitySnapshot(existing),
    after: { archivedAt: archived.archivedAt },
  });

  return detail;
}

export async function listAllOpportunitiesForWorkspace(
  workspaceId: string,
  filter: Omit<OpportunityListServiceFilter, "page" | "pageSize"> = {},
): Promise<OpportunityListItem[]> {
  const resolvedFilter = await buildListFilter(workspaceId, filter);
  const opportunities = await findAllOpportunities(workspaceId, resolvedFilter);

  return Promise.all(
    opportunities.map((opportunity) => enrichOpportunityListItem(opportunity)),
  );
}
