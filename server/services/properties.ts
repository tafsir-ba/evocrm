import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import { findProjectById } from "@/server/repositories/projects";
import {
  archiveProperty,
  createProperty,
  findPropertyById,
  findPropertyByReference,
  findProperties,
  updateProperty,
  type PropertyListFilter,
  type PropertyRecord,
} from "@/server/repositories/properties";
import { findTagById } from "@/server/repositories/tags";
import { findUserById } from "@/server/repositories/users";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import { assertValidProjectFilter } from "@/server/services/project-scope";
import type { CreatePropertyInput, UpdatePropertyInput } from "@/server/validation/properties";

export type PropertyDictionarySummary = {
  id: string;
  label: string;
  color: string;
  key: string;
};

export type PropertyTagSummary = {
  id: string;
  name: string;
  color: string;
};

export type PropertyUserSummary = {
  id: string;
  name: string | null;
  email: string;
};

export type PropertyProjectSummary = {
  id: string;
  name: string;
  reference: string | null;
  city: string | null;
  country: string | null;
};

export type PropertyListItem = PropertyRecord & {
  status: PropertyDictionarySummary | null;
  type: PropertyDictionarySummary | null;
  project: PropertyProjectSummary | null;
  tagsResolved: PropertyTagSummary[];
  assignedUser: PropertyUserSummary | null;
};

export type PropertyDetail = PropertyListItem & {
  ownerUser: PropertyUserSummary | null;
};

export function normalizePropertyReference(
  reference: string | null | undefined,
): string | null {
  if (!reference) {
    return null;
  }

  const trimmed = reference.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePropertyFeatures(features: string[] | undefined): string[] {
  if (!features || features.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const feature of features) {
    const trimmed = feature.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);

    if (normalized.length >= 30) {
      break;
    }
  }

  return normalized;
}

async function validatePropertyStatusId(
  workspaceId: string,
  statusId: string,
  existingStatusId?: string,
): Promise<void> {
  const item = await findDictionaryItemById(workspaceId, statusId);

  if (!item || item.type !== "property_status") {
    throw new AppError("VALIDATION_ERROR", "Invalid property status.");
  }

  if (!item.isActive && statusId !== existingStatusId) {
    throw new AppError("VALIDATION_ERROR", "Property status must be active.");
  }
}

async function validatePropertyTypeId(
  workspaceId: string,
  typeId: string | null | undefined,
  existingTypeId?: string | null,
): Promise<void> {
  if (!typeId) {
    return;
  }

  const item = await findDictionaryItemById(workspaceId, typeId);

  if (!item || item.type !== "property_type") {
    throw new AppError("VALIDATION_ERROR", "Invalid property type.");
  }

  if (!item.isActive && typeId !== existingTypeId) {
    throw new AppError("VALIDATION_ERROR", "Property type must be active.");
  }
}

async function validatePropertyProjectId(
  workspaceId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) {
    throw new AppError("VALIDATION_ERROR", "Project is required.");
  }

  const project = await findProjectById(workspaceId, projectId);

  if (!project || project.archivedAt) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Project must exist in this workspace and not be archived.",
    );
  }
}

async function validatePropertyTags(
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

    if (!tag.entityTypes.includes("property")) {
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more tags cannot be assigned to properties.",
      );
    }
  }
}

async function assertUniqueReference(
  workspaceId: string,
  reference: string | null | undefined,
  excludePropertyId?: string,
): Promise<void> {
  if (!reference) {
    return;
  }

  const duplicate = await findPropertyByReference(workspaceId, reference);

  if (duplicate && duplicate.id !== excludePropertyId) {
    throw new AppError(
      "CONFLICT",
      "A property with this reference already exists in this workspace.",
    );
  }
}

async function resolveUserSummary(
  userId: string | null,
): Promise<PropertyUserSummary | null> {
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
  type: "property_status" | "property_type",
): Promise<PropertyDictionarySummary | null> {
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

async function resolveProjectSummary(
  workspaceId: string,
  projectId: string | null,
): Promise<PropertyProjectSummary | null> {
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
    city: project.city,
    country: project.country,
  };
}

async function resolveTagsSummary(
  workspaceId: string,
  tagIds: string[],
): Promise<PropertyTagSummary[]> {
  const resolved: PropertyTagSummary[] = [];

  for (const tagId of tagIds) {
    const tag = await findTagById(workspaceId, tagId);
    if (tag) {
      resolved.push({ id: tag.id, name: tag.name, color: tag.color });
    }
  }

  return resolved;
}

async function enrichPropertyListItem(
  property: PropertyRecord,
): Promise<PropertyListItem> {
  const [status, type, project, tagsResolved, assignedUser] = await Promise.all([
    resolveDictionarySummary(property.workspaceId, property.statusId, "property_status"),
    resolveDictionarySummary(property.workspaceId, property.typeId, "property_type"),
    resolveProjectSummary(property.workspaceId, property.projectId),
    resolveTagsSummary(property.workspaceId, property.tags),
    resolveUserSummary(property.assignedTo),
  ]);

  return {
    ...property,
    status,
    type,
    project,
    tagsResolved,
    assignedUser,
  };
}

async function enrichPropertyRecord(property: PropertyRecord): Promise<PropertyDetail> {
  const listItem = await enrichPropertyListItem(property);
  const ownerUser = await resolveUserSummary(property.ownerId);
  return { ...listItem, ownerUser };
}

function propertySnapshot(property: PropertyRecord): Record<string, unknown> {
  return {
    projectId: property.projectId,
    statusId: property.statusId,
    typeId: property.typeId,
    ownerId: property.ownerId,
    assignedTo: property.assignedTo,
    title: property.title,
    reference: property.reference,
    price: property.price,
    currency: property.currency,
    tags: property.tags,
  };
}

export async function listPropertiesForWorkspace(
  workspaceId: string,
  filter: PropertyListFilter = {},
): Promise<{ properties: PropertyListItem[]; total: number }> {
  await assertValidProjectFilter(workspaceId, filter.projectId);
  const { properties, total } = await findProperties(workspaceId, filter);

  const enriched = await Promise.all(
    properties.map((property) => enrichPropertyListItem(property)),
  );

  return { properties: enriched, total };
}

export async function getPropertyForWorkspace(
  workspaceId: string,
  propertyId: string,
): Promise<PropertyDetail> {
  const property = await findPropertyById(workspaceId, propertyId);

  if (!property) {
    throw new AppError("NOT_FOUND", "Property not found.");
  }

  return enrichPropertyRecord(property);
}

export async function createPropertyForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreatePropertyInput,
  defaultCurrency: string,
): Promise<PropertyDetail> {
  await validatePropertyStatusId(workspaceId, input.statusId);
  await validatePropertyTypeId(workspaceId, input.typeId);
  await validatePropertyProjectId(workspaceId, input.projectId);
  await validatePropertyTags(workspaceId, input.tags);
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");
  await validateOptionalAssignableMember(
    workspaceId,
    input.assignedTo,
    "Assigned to",
  );

  const reference = normalizePropertyReference(input.reference);
  await assertUniqueReference(workspaceId, reference);

  const property = await createProperty({
    workspaceId,
    createdBy: actorId,
    projectId: input.projectId,
    statusId: input.statusId,
    typeId: input.typeId ?? null,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    title: input.title,
    reference,
    price: input.price ?? null,
    currency: input.currency ?? defaultCurrency,
    address: input.address ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    rooms: input.rooms ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    surface: input.surface ?? null,
    totalSurface: input.totalSurface ?? null,
    balconyTerraceSurface: input.balconyTerraceSurface ?? null,
    surfaceUnit: input.surfaceUnit ?? "sqm",
    floor: input.floor ?? null,
    building: input.building ?? null,
    lot: input.lot ?? null,
    description: input.description ?? null,
    features: normalizePropertyFeatures(input.features),
    tags: input.tags ?? [],
    attributes: input.attributes ?? {},
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "property.created",
    entityType: "property",
    entityId: property.id,
    after: propertySnapshot(property),
  });

  return enrichPropertyRecord(property);
}

export async function updatePropertyForWorkspace(
  workspaceId: string,
  propertyId: string,
  actorId: string,
  input: UpdatePropertyInput,
): Promise<PropertyDetail> {
  const existing = await findPropertyById(workspaceId, propertyId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Property not found.");
  }

  if (input.statusId !== undefined) {
    await validatePropertyStatusId(workspaceId, input.statusId, existing.statusId);
  }
  if (input.typeId !== undefined) {
    await validatePropertyTypeId(workspaceId, input.typeId, existing.typeId);
  }
  if (input.projectId !== undefined) {
    await validatePropertyProjectId(workspaceId, input.projectId);
  }
  if (input.tags !== undefined) {
    await validatePropertyTags(workspaceId, input.tags);
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

  const updatePayload: Parameters<typeof updateProperty>[2] = {};

  if (input.projectId !== undefined) {
    updatePayload.projectId = input.projectId;
  }
  if (input.statusId !== undefined) {
    updatePayload.statusId = input.statusId;
  }
  if (input.typeId !== undefined) {
    updatePayload.typeId = input.typeId;
  }
  if (input.ownerId !== undefined) {
    updatePayload.ownerId = input.ownerId;
  }
  if (input.assignedTo !== undefined) {
    updatePayload.assignedTo = input.assignedTo;
  }
  if (input.title !== undefined) {
    updatePayload.title = input.title.trim();
  }
  if (input.reference !== undefined) {
    const reference = normalizePropertyReference(input.reference);
    await assertUniqueReference(workspaceId, reference, propertyId);
    updatePayload.reference = reference;
  }
  if (input.price !== undefined) {
    updatePayload.price = input.price;
  }
  if (input.currency !== undefined) {
    updatePayload.currency = input.currency;
  }
  if (input.address !== undefined) {
    updatePayload.address = input.address?.trim() || null;
  }
  if (input.city !== undefined) {
    updatePayload.city = input.city?.trim() || null;
  }
  if (input.country !== undefined) {
    updatePayload.country = input.country?.trim() || null;
  }
  if (input.rooms !== undefined) {
    updatePayload.rooms = input.rooms;
  }
  if (input.bedrooms !== undefined) {
    updatePayload.bedrooms = input.bedrooms;
  }
  if (input.bathrooms !== undefined) {
    updatePayload.bathrooms = input.bathrooms;
  }
  if (input.surface !== undefined) {
    updatePayload.surface = input.surface;
  }
  if (input.totalSurface !== undefined) {
    updatePayload.totalSurface = input.totalSurface;
  }
  if (input.balconyTerraceSurface !== undefined) {
    updatePayload.balconyTerraceSurface = input.balconyTerraceSurface;
  }
  if (input.surfaceUnit !== undefined) {
    updatePayload.surfaceUnit = input.surfaceUnit;
  }
  if (input.floor !== undefined) {
    updatePayload.floor = input.floor;
  }
  if (input.building !== undefined) {
    updatePayload.building = input.building?.trim() || null;
  }
  if (input.lot !== undefined) {
    updatePayload.lot = input.lot?.trim() || null;
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description?.trim() || null;
  }
  if (input.features !== undefined) {
    updatePayload.features = normalizePropertyFeatures(input.features);
  }
  if (input.tags !== undefined) {
    updatePayload.tags = input.tags;
  }
  if (input.attributes !== undefined) {
    updatePayload.attributes = input.attributes;
  }

  const updated = await updateProperty(workspaceId, propertyId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Property not found.");
  }

  const auditActions: Array<{
    action: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }> = [
    {
      action: "property.updated",
      before: propertySnapshot(existing),
      after: propertySnapshot(updated),
    },
  ];

  if (input.statusId !== undefined && input.statusId !== existing.statusId) {
    auditActions.push({
      action: "property.status_changed",
      before: { statusId: existing.statusId },
      after: { statusId: updated.statusId },
    });
  }

  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
    auditActions.push({
      action: "property.assigned",
      before: { assignedTo: existing.assignedTo },
      after: { assignedTo: updated.assignedTo },
    });
  }

  if (input.tags !== undefined) {
    auditActions.push({
      action: "property.tags_updated",
      before: { tags: existing.tags },
      after: { tags: updated.tags },
    });
  }

  if (input.projectId !== undefined && input.projectId !== existing.projectId) {
    auditActions.push({
      action: "property.project_changed",
      before: { projectId: existing.projectId },
      after: { projectId: updated.projectId },
    });
  }

  for (const entry of auditActions) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: entry.action,
      entityType: "property",
      entityId: propertyId,
      before: entry.before,
      after: entry.after,
    });
  }

  return enrichPropertyRecord(updated);
}

export async function archivePropertyForWorkspace(
  workspaceId: string,
  propertyId: string,
  actorId: string,
): Promise<PropertyDetail> {
  const existing = await findPropertyById(workspaceId, propertyId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Property not found.");
  }

  const archived = await archiveProperty(workspaceId, propertyId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Property not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "property.archived",
    entityType: "property",
    entityId: propertyId,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt },
  });

  return enrichPropertyRecord(archived);
}
