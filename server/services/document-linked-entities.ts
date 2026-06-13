import "server-only";

import { findLeadById } from "@/server/repositories/leads";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findPropertyById } from "@/server/repositories/properties";
import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import type { DocumentLinkedEntityType } from "@/server/validation/documents";

export type ValidatedDocumentLinkedEntity = {
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  readPermission: PermissionKey;
  updatePermission: PermissionKey;
};

/**
 * Validates that a linked entity exists in the workspace and is not archived.
 * Campaign documents are blocked until Phase 10 (Campaign model).
 */
export async function validateDocumentLinkedEntity(
  workspaceId: string,
  linkedEntityType: DocumentLinkedEntityType,
  linkedEntityId: string,
): Promise<ValidatedDocumentLinkedEntity> {
  if (linkedEntityType === "campaign") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Campaign document attachments are not supported until Phase 10.",
      { details: { linkedEntityType } },
    );
  }

  if (linkedEntityType === "lead") {
    const lead = await findLeadById(workspaceId, linkedEntityId);

    if (!lead || lead.archivedAt) {
      throw new AppError("NOT_FOUND", "Linked lead not found.");
    }

    return {
      linkedEntityType,
      linkedEntityId,
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
      readPermission: "opportunity:read",
      updatePermission: "opportunity:update",
    };
  }

  throw new AppError("VALIDATION_ERROR", "Unsupported linked entity type.");
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
