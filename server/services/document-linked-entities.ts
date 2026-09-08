import "server-only";

import { findLeadById } from "@/server/repositories/leads";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findPropertyById } from "@/server/repositories/properties";
import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  assertMultiProjectRecordAccess,
  assertRecordProjectAccess,
} from "@/server/services/apply-project-scope";
import type { DocumentLinkedEntityType } from "@/server/validation/documents";

export type ValidatedDocumentLinkedEntity = {
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  projectId: string | null;
  projectIds: string[];
  readPermission: PermissionKey;
  updatePermission: PermissionKey;
};

/**
 * Validates that a linked entity exists in the workspace and is not archived.
 * Returns project scope metadata for grant enforcement.
 */
export async function validateDocumentLinkedEntity(
  workspaceId: string,
  linkedEntityType: DocumentLinkedEntityType,
  linkedEntityId: string,
): Promise<ValidatedDocumentLinkedEntity> {
  if (linkedEntityType === "campaign") {
    const campaign = await findCampaignById(workspaceId, linkedEntityId);

    if (!campaign || campaign.archivedAt) {
      throw new AppError("NOT_FOUND", "Linked campaign not found.");
    }

    return {
      linkedEntityType,
      linkedEntityId,
      projectId: campaign.projectIds[0] ?? null,
      projectIds: campaign.projectIds,
      readPermission: "campaign:read",
      updatePermission: "campaign:update",
    };
  }

  if (linkedEntityType === "lead") {
    const lead = await findLeadById(workspaceId, linkedEntityId);

    if (!lead || lead.archivedAt) {
      throw new AppError("NOT_FOUND", "Linked lead not found.");
    }

    return {
      linkedEntityType,
      linkedEntityId,
      projectId: lead.projectId,
      projectIds: lead.projectId ? [lead.projectId] : [],
      readPermission: "lead:read",
      updatePermission: "lead:update",
    };
  }

  if (linkedEntityType === "property") {
    const property = await findPropertyById(workspaceId, linkedEntityId);

    if (!property || property.archivedAt) {
      throw new AppError("NOT_FOUND", "Linked property not found.");
    }

    return {
      linkedEntityType,
      linkedEntityId,
      projectId: property.projectId,
      projectIds: property.projectId ? [property.projectId] : [],
      readPermission: "property:read",
      updatePermission: "property:update",
    };
  }

  if (linkedEntityType === "opportunity") {
    const opportunity = await findOpportunityById(workspaceId, linkedEntityId);

    if (!opportunity || opportunity.archivedAt) {
      throw new AppError("NOT_FOUND", "Linked opportunity not found.");
    }

    return {
      linkedEntityType,
      linkedEntityId,
      projectId: opportunity.projectId,
      projectIds: opportunity.projectId ? [opportunity.projectId] : [],
      readPermission: "opportunity:read",
      updatePermission: "opportunity:update",
    };
  }

  throw new AppError("VALIDATION_ERROR", "Unsupported linked entity type.");
}

export async function assertDocumentLinkedEntityProjectAccess(
  workspaceId: string,
  userId: string | undefined,
  entity: ValidatedDocumentLinkedEntity,
  permission?: PermissionKey,
): Promise<void> {
  if (entity.linkedEntityType === "campaign") {
    await assertMultiProjectRecordAccess(
      workspaceId,
      userId,
      entity.projectIds,
      permission ?? entity.readPermission,
    );
    return;
  }

  await assertRecordProjectAccess(
    workspaceId,
    userId,
    entity.projectId,
    permission ?? entity.readPermission,
  );
}

export function getEntityReadPermission(
  linkedEntityType: DocumentLinkedEntityType,
): PermissionKey {
  switch (linkedEntityType) {
    case "lead":
      return "lead:read";
    case "property":
      return "property:read";
    case "opportunity":
      return "opportunity:read";
    case "campaign":
      return "campaign:read";
    default:
      throw new AppError("VALIDATION_ERROR", "Unsupported linked entity type.");
  }
}
