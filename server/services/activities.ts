import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  archiveActivity,
  createActivity,
  findActivities,
  findActivityById,
  updateActivity,
  type ActivityListFilter,
  type ActivityRecord,
} from "@/server/repositories/activities";
import {
  findDictionaryItemById,
  findDictionaryItemByTypeAndBehavior,
  findDictionaryItems,
} from "@/server/repositories/dictionary-items";
import type { DictionaryItemRecord } from "@/server/repositories/dictionary-items";
import { findLeadById } from "@/server/repositories/leads";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findPropertyById } from "@/server/repositories/properties";
import { findUserById } from "@/server/repositories/users";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import {
  assertValidProjectFilter,
  validateActiveProjectId,
} from "@/server/services/project-scope";
import {
  applyActivityStatusBehavior,
  isActivityOverdue,
  isActivityUpcoming,
} from "@/server/services/activity-status";
import {
  isActivityCancelledBehavior,
  isActivityCompletedBehavior,
  isActivityPendingBehavior,
} from "@/server/services/dictionary-items";
import type {
  ActivityListQuery,
  CancelActivityInput,
  CompleteActivityInput,
  CreateActivityInput,
  UpdateActivityInput,
} from "@/server/validation/activities";

export type ActivityDictionarySummary = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
};

export type ActivityUserSummary = {
  id: string;
  name: string | null;
  email: string;
};

export type ActivityLeadSummary = {
  id: string;
  fullName: string;
  email: string | null;
};

export type ActivityPropertySummary = {
  id: string;
  title: string;
  reference: string | null;
};

export type ActivityOpportunitySummary = {
  id: string;
  leadId: string;
  propertyId: string;
};

export type ActivityListItem = ActivityRecord & {
  type: ActivityDictionarySummary | null;
  status: ActivityDictionarySummary | null;
  lead: ActivityLeadSummary | null;
  property: ActivityPropertySummary | null;
  opportunity: ActivityOpportunitySummary | null;
  assignedUser: ActivityUserSummary | null;
  createdByUser: ActivityUserSummary | null;
  isOverdue: boolean;
  isUpcoming: boolean;
};

export type ActivityDetail = ActivityListItem & {
  ownerUser: ActivityUserSummary | null;
};

type ResolvedRelationships = {
  projectId: string;
  opportunityId: string | null;
  leadId: string | null;
  propertyId: string | null;
};

async function resolveRelationships(
  workspaceId: string,
  input: {
    projectId?: string;
    opportunityId?: string | null;
    leadId?: string | null;
    propertyId?: string | null;
  },
): Promise<ResolvedRelationships> {
  let opportunityId = input.opportunityId ?? null;
  let leadId = input.leadId ?? null;
  let propertyId = input.propertyId ?? null;
  let projectId = input.projectId ?? null;

  if (!opportunityId && !leadId && !propertyId && !projectId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "At least one of opportunityId, leadId, propertyId, or projectId is required.",
    );
  }

  if (opportunityId) {
    const opportunity = await findOpportunityById(workspaceId, opportunityId);

    if (!opportunity || opportunity.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Opportunity must exist in this workspace and not be archived.",
      );
    }

    leadId = opportunity.leadId;
    propertyId = opportunity.propertyId;
    projectId = opportunity.projectId;

    if (!projectId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Opportunity must belong to a project.",
      );
    }

    return { opportunityId, leadId, propertyId, projectId };
  }

  const projectIds = new Set<string>();

  if (leadId) {
    const lead = await findLeadById(workspaceId, leadId);

    if (!lead || lead.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Lead must exist in this workspace and not be archived.",
      );
    }

    if (lead.projectId) {
      projectIds.add(lead.projectId);
      if (!projectId) {
        projectId = lead.projectId;
      }
    }
  }

  if (propertyId) {
    const property = await findPropertyById(workspaceId, propertyId);

    if (!property || property.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Property must exist in this workspace and not be archived.",
      );
    }

    if (property.projectId) {
      projectIds.add(property.projectId);
      if (!projectId) {
        projectId = property.projectId;
      }
    }
  }

  if (projectIds.size > 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Linked lead and property belong to different projects.",
    );
  }

  if (input.projectId && projectId && input.projectId !== projectId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Provided projectId does not match linked lead or property project.",
    );
  }

  if (!projectId) {
    throw new AppError("VALIDATION_ERROR", "Project is required.");
  }

  await validateActiveProjectId(workspaceId, projectId);

  return { opportunityId, leadId, propertyId, projectId };
}

async function validateActivityTypeId(
  workspaceId: string,
  typeId: string,
  existingTypeId?: string,
): Promise<DictionaryItemRecord> {
  const item = await findDictionaryItemById(workspaceId, typeId);

  if (!item || item.type !== "activity_type") {
    throw new AppError("VALIDATION_ERROR", "Invalid activity type for this workspace.");
  }

  if (!item.isActive && typeId !== existingTypeId) {
    throw new AppError("VALIDATION_ERROR", "Activity type is inactive.");
  }

  return item;
}

async function validateActivityStatusId(
  workspaceId: string,
  statusId: string,
  existingStatusId?: string,
): Promise<DictionaryItemRecord> {
  const item = await findDictionaryItemById(workspaceId, statusId);

  if (!item || item.type !== "activity_status") {
    throw new AppError("VALIDATION_ERROR", "Invalid activity status for this workspace.");
  }

  if (!item.isActive && statusId !== existingStatusId) {
    throw new AppError("VALIDATION_ERROR", "Activity status is inactive.");
  }

  return item;
}

async function resolveUserSummary(
  userId: string | null,
): Promise<ActivityUserSummary | null> {
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
  type: "activity_type" | "activity_status",
): Promise<ActivityDictionarySummary | null> {
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
    behavior: item.behavior,
  };
}

async function resolveLeadSummary(
  workspaceId: string,
  leadId: string | null,
): Promise<ActivityLeadSummary | null> {
  if (!leadId) {
    return null;
  }

  const lead = await findLeadById(workspaceId, leadId);

  if (!lead) {
    return null;
  }

  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
  };
}

async function resolvePropertySummary(
  workspaceId: string,
  propertyId: string | null,
): Promise<ActivityPropertySummary | null> {
  if (!propertyId) {
    return null;
  }

  const property = await findPropertyById(workspaceId, propertyId);

  if (!property) {
    return null;
  }

  return {
    id: property.id,
    title: property.title,
    reference: property.reference,
  };
}

async function resolveOpportunitySummary(
  workspaceId: string,
  opportunityId: string | null,
): Promise<ActivityOpportunitySummary | null> {
  if (!opportunityId) {
    return null;
  }

  const opportunity = await findOpportunityById(workspaceId, opportunityId);

  if (!opportunity) {
    return null;
  }

  return {
    id: opportunity.id,
    leadId: opportunity.leadId,
    propertyId: opportunity.propertyId,
  };
}

export async function enrichActivityListItem(activity: ActivityRecord): Promise<ActivityListItem> {
  const [type, status, lead, property, opportunity, assignedUser, createdByUser] = await Promise.all([
    resolveDictionarySummary(activity.workspaceId, activity.typeId, "activity_type"),
    resolveDictionarySummary(activity.workspaceId, activity.statusId, "activity_status"),
    resolveLeadSummary(activity.workspaceId, activity.leadId),
    resolvePropertySummary(activity.workspaceId, activity.propertyId),
    resolveOpportunitySummary(activity.workspaceId, activity.opportunityId),
    resolveUserSummary(activity.assignedTo),
    resolveUserSummary(activity.createdBy),
  ]);

  const now = new Date();

  return {
    ...activity,
    type,
    status,
    lead,
    property,
    opportunity,
    assignedUser,
    createdByUser,
    isOverdue: isActivityOverdue(activity, status?.behavior, now),
    isUpcoming: isActivityUpcoming(activity, status?.behavior, now),
  };
}

async function enrichActivityRecord(activity: ActivityRecord): Promise<ActivityDetail> {
  const listItem = await enrichActivityListItem(activity);
  const ownerUser = await resolveUserSummary(activity.ownerId);
  return { ...listItem, ownerUser };
}

function activitySnapshot(activity: ActivityRecord): Record<string, unknown> {
  return {
    opportunityId: activity.opportunityId,
    leadId: activity.leadId,
    propertyId: activity.propertyId,
    typeId: activity.typeId,
    statusId: activity.statusId,
    ownerId: activity.ownerId,
    assignedTo: activity.assignedTo,
    title: activity.title,
    dueDate: activity.dueDate,
    completedAt: activity.completedAt,
    cancelledAt: activity.cancelledAt,
  };
}

async function getPendingStatusIds(workspaceId: string): Promise<string[]> {
  const items = await findDictionaryItems(workspaceId, { type: "activity_status" });
  return items
    .filter((item) => isActivityPendingBehavior(item.behavior))
    .map((item) => item.id);
}

function buildListFilterFromQuery(
  workspaceId: string,
  query: ActivityListQuery,
  currentUserId?: string,
): Promise<ActivityListFilter> {
  return (async () => {
    const filter: ActivityListFilter = {
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
      search: query.search,
      typeId: query.typeId,
      statusId: query.statusId,
      assignedTo: query.assignedTo,
      ownerId: query.ownerId,
      leadId: query.leadId,
      propertyId: query.propertyId,
      opportunityId: query.opportunityId,
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      completedFrom: query.completedFrom,
      completedTo: query.completedTo,
    };

    if (query.view === "mine" && currentUserId) {
      filter.assignedTo = currentUserId;
    }

    if (query.view === "upcoming" || query.view === "overdue") {
      const pendingStatusIds = await getPendingStatusIds(workspaceId);
      filter.requireDueDate = true;
      const now = new Date();

      if (query.view === "upcoming") {
        filter.dueAfter = now;
      } else {
        filter.dueBefore = now;
      }

      if (query.statusId) {
        if (pendingStatusIds.includes(query.statusId)) {
          filter.statusId = query.statusId;
        } else {
          filter.emptyResult = true;
        }
      } else {
        filter.pendingStatusIds = pendingStatusIds;
      }
    }

    return filter;
  })();
}

export async function listActivitiesForWorkspace(
  workspaceId: string,
  query: ActivityListQuery,
  currentUserId?: string,
): Promise<{ activities: ActivityListItem[]; total: number }> {
  await assertValidProjectFilter(workspaceId, query.projectId);
  const filter = await buildListFilterFromQuery(workspaceId, query, currentUserId);
  const { activities, total } = await findActivities(workspaceId, filter);
  const enriched = await Promise.all(activities.map((activity) => enrichActivityListItem(activity)));
  return { activities: enriched, total };
}

export async function getActivityForWorkspace(
  workspaceId: string,
  activityId: string,
): Promise<ActivityDetail> {
  const activity = await findActivityById(workspaceId, activityId);

  if (!activity) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  return enrichActivityRecord(activity);
}

export async function createActivityForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateActivityInput,
): Promise<ActivityDetail> {
  await validateActivityTypeId(workspaceId, input.typeId);
  const status = await validateActivityStatusId(workspaceId, input.statusId);
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalAssignableMember(workspaceId, input.assignedTo, "Assigned to");

  const relationships = await resolveRelationships(workspaceId, input);
  const behaviorEffects = applyActivityStatusBehavior(status);

  const assignedTo = input.assignedTo ?? actorId;

  const activity = await createActivity({
    workspaceId,
    ...relationships,
    typeId: input.typeId,
    statusId: input.statusId,
    ownerId: input.ownerId ?? null,
    assignedTo,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    outcome: input.outcome ?? null,
    nextActionDate: input.nextActionDate ?? null,
    completedAt: behaviorEffects.completedAt,
    cancelledAt: behaviorEffects.cancelledAt,
    createdBy: actorId,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "activity.created",
    entityType: "activity",
    entityId: activity.id,
    after: activitySnapshot(activity),
  });

  return enrichActivityRecord(activity);
}

export async function updateActivityForWorkspace(
  workspaceId: string,
  activityId: string,
  actorId: string,
  input: UpdateActivityInput,
): Promise<ActivityDetail> {
  const existing = await findActivityById(workspaceId, activityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  const before = activitySnapshot(existing);
  const updatePayload: Parameters<typeof updateActivity>[2] = {};

  if (input.title !== undefined) {
    updatePayload.title = input.title;
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description;
  }
  if (input.dueDate !== undefined) {
    updatePayload.dueDate = input.dueDate;
  }
  if (input.outcome !== undefined) {
    updatePayload.outcome = input.outcome;
  }
  if (input.nextActionDate !== undefined) {
    updatePayload.nextActionDate = input.nextActionDate;
  }
  if (input.ownerId !== undefined) {
    await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
    updatePayload.ownerId = input.ownerId;
  }
  if (input.assignedTo !== undefined) {
    await validateOptionalAssignableMember(workspaceId, input.assignedTo, "Assigned to");
    updatePayload.assignedTo = input.assignedTo;
  }
  if (input.typeId !== undefined) {
    await validateActivityTypeId(workspaceId, input.typeId, existing.typeId);
    updatePayload.typeId = input.typeId;
  }

  const relationshipInput = {
    opportunityId:
      input.opportunityId !== undefined ? input.opportunityId : existing.opportunityId,
    leadId: input.leadId !== undefined ? input.leadId : existing.leadId,
    propertyId: input.propertyId !== undefined ? input.propertyId : existing.propertyId,
  };

  if (
    input.opportunityId !== undefined ||
    input.leadId !== undefined ||
    input.propertyId !== undefined
  ) {
    const relationships = await resolveRelationships(workspaceId, relationshipInput);
    updatePayload.opportunityId = relationships.opportunityId;
    updatePayload.leadId = relationships.leadId;
    updatePayload.propertyId = relationships.propertyId;
    updatePayload.projectId = relationships.projectId;
  }

  if (input.statusId !== undefined) {
    const status = await validateActivityStatusId(
      workspaceId,
      input.statusId,
      existing.statusId,
    );
    const behaviorEffects = applyActivityStatusBehavior(status);
    updatePayload.statusId = input.statusId;
    updatePayload.completedAt = behaviorEffects.completedAt;
    updatePayload.cancelledAt = behaviorEffects.cancelledAt;
  }

  const updated = await updateActivity(workspaceId, activityId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  const auditAction =
    input.dueDate !== undefined
      ? "activity.rescheduled"
      : input.assignedTo !== undefined
        ? "activity.assigned"
        : input.opportunityId !== undefined ||
            input.leadId !== undefined ||
            input.propertyId !== undefined
          ? "activity.relationship_changed"
          : input.statusId !== undefined
            ? "activity.updated"
            : "activity.updated";

  await createAuditLog({
    workspaceId,
    actorId,
    action: auditAction,
    entityType: "activity",
    entityId: activityId,
    before,
    after: activitySnapshot(updated),
  });

  return enrichActivityRecord(updated);
}

export async function completeActivityForWorkspace(
  workspaceId: string,
  activityId: string,
  actorId: string,
  input: CompleteActivityInput,
): Promise<ActivityDetail> {
  const existing = await findActivityById(workspaceId, activityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  const completedStatus = await findDictionaryItemByTypeAndBehavior(
    workspaceId,
    "activity_status",
    "completed",
  );

  if (!completedStatus) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No completed activity status configured for this workspace.",
    );
  }

  const before = activitySnapshot(existing);
  const behaviorEffects = applyActivityStatusBehavior(completedStatus);
  const updated = await updateActivity(workspaceId, activityId, {
    statusId: completedStatus.id,
    completedAt: behaviorEffects.completedAt,
    cancelledAt: behaviorEffects.cancelledAt,
    outcome: input.outcome ?? existing.outcome,
    nextActionDate: input.nextActionDate ?? existing.nextActionDate,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "activity.completed",
    entityType: "activity",
    entityId: activityId,
    before,
    after: activitySnapshot(updated),
  });

  return enrichActivityRecord(updated);
}

export async function cancelActivityForWorkspace(
  workspaceId: string,
  activityId: string,
  actorId: string,
  input: CancelActivityInput,
): Promise<ActivityDetail> {
  const existing = await findActivityById(workspaceId, activityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  const cancelledStatus = await findDictionaryItemByTypeAndBehavior(
    workspaceId,
    "activity_status",
    "cancelled",
  );

  if (!cancelledStatus) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No cancelled activity status configured for this workspace.",
    );
  }

  const before = activitySnapshot(existing);
  const behaviorEffects = applyActivityStatusBehavior(cancelledStatus);
  const updated = await updateActivity(workspaceId, activityId, {
    statusId: cancelledStatus.id,
    completedAt: behaviorEffects.completedAt,
    cancelledAt: behaviorEffects.cancelledAt,
    outcome: input.outcome ?? existing.outcome,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "activity.cancelled",
    entityType: "activity",
    entityId: activityId,
    before,
    after: activitySnapshot(updated),
  });

  return enrichActivityRecord(updated);
}

export async function archiveActivityForWorkspace(
  workspaceId: string,
  activityId: string,
  actorId: string,
): Promise<ActivityDetail> {
  const existing = await findActivityById(workspaceId, activityId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  const before = activitySnapshot(existing);
  const archived = await archiveActivity(workspaceId, activityId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Activity not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "activity.archived",
    entityType: "activity",
    entityId: activityId,
    before,
    after: activitySnapshot(archived),
  });

  return enrichActivityRecord(archived);
}

export {
  applyActivityStatusBehavior,
  isActivityOverdue,
  isActivityUpcoming,
  isActivityCancelledBehavior,
  isActivityCompletedBehavior,
  isActivityPendingBehavior,
};
