import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { PropertyModel, type PropertyDocument } from "@/models/property";
import type { SurfaceUnit } from "@/lib/surface-unit";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { toObjectIdString } from "@/server/utils/mongo-id";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type PropertyRecord = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  statusId: string;
  typeId: string | null;
  ownerId: string | null;
  assignedTo: string | null;
  title: string;
  reference: string | null;
  price: number | null;
  currency: string;
  address: string | null;
  city: string | null;
  country: string | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surface: number | null;
  surfaceUnit: SurfaceUnit;
  floor: number | null;
  description: string | null;
  features: string[];
  tags: string[];
  attributes: Record<string, unknown>;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPropertyRecord(document: PropertyDocument): PropertyRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: toObjectIdString(document.projectId),
    statusId: document.statusId.toString(),
    typeId: document.typeId?.toString() ?? null,
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    title: document.title,
    reference: document.reference ?? null,
    price: document.price ?? null,
    currency: document.currency,
    address: document.address ?? null,
    city: document.city ?? null,
    country: document.country ?? null,
    rooms: document.rooms ?? null,
    bedrooms: document.bedrooms ?? null,
    bathrooms: document.bathrooms ?? null,
    surface: document.surface ?? null,
    surfaceUnit: document.surfaceUnit === "sqft" ? "sqft" : "sqm",
    floor: document.floor ?? null,
    description: document.description ?? null,
    features: document.features ?? [],
    tags: (document.tags ?? []).map((tagId) => tagId.toString()),
    attributes: (document.attributes as Record<string, unknown>) ?? {},
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type PropertyListFilter = {
  includeArchived?: boolean;
  search?: string;
  statusId?: string;
  typeId?: string;
  projectId?: string;
  assignedTo?: string;
  ownerId?: string;
  tagId?: string;
  city?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  createdFrom?: Date;
  createdTo?: Date;
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: PropertyListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.statusId) {
    query.statusId = filter.statusId;
  }
  if (filter.typeId) {
    query.typeId = filter.typeId;
  }
  if (filter.projectId) {
    query.projectId = filter.projectId;
  }
  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }
  if (filter.ownerId) {
    query.ownerId = filter.ownerId;
  }
  if (filter.tagId) {
    query.tags = filter.tagId;
  }
  if (filter.city) {
    query.city = new RegExp(
      filter.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  if (filter.country) {
    query.country = new RegExp(
      filter.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }

  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (filter.minPrice !== undefined) {
      price.$gte = filter.minPrice;
    }
    if (filter.maxPrice !== undefined) {
      price.$lte = filter.maxPrice;
    }
    query.price = price;
  }

  if (filter.createdFrom || filter.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (filter.createdFrom) {
      createdAt.$gte = filter.createdFrom;
    }
    if (filter.createdTo) {
      createdAt.$lte = filter.createdTo;
    }
    query.createdAt = createdAt;
  }

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [
      { title: regex },
      { reference: regex },
      { address: regex },
      { city: regex },
      { country: regex },
      { description: regex },
    ];
  }

  return query;
}

export async function findProperties(
  workspaceId: string,
  filter: PropertyListFilter = {},
): Promise<{ properties: PropertyRecord[]; total: number }> {
  await connectDb();
  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    PropertyModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean<PropertyDocument[]>(),
    PropertyModel.countDocuments(query),
  ]);

  return {
    properties: documents.map(toPropertyRecord),
    total,
  };
}

export async function findPropertyById(
  workspaceId: string,
  propertyId: string,
): Promise<PropertyRecord | null> {
  await connectDb();
  const document = await PropertyModel.findOne(
    withWorkspaceScope(workspaceId, { _id: propertyId }),
  ).lean<PropertyDocument>();
  return document ? toPropertyRecord(document) : null;
}

export async function findPropertiesByReferences(
  workspaceId: string,
  references: string[],
): Promise<Set<string>> {
  await connectDb();

  const uniqueReferences = [...new Set(references.map((reference) => reference.trim()).filter(Boolean))];

  if (uniqueReferences.length === 0) {
    return new Set();
  }

  const documents = await PropertyModel.find(
    withWorkspaceScope(workspaceId, {
      reference: { $in: uniqueReferences },
    }),
  )
    .select({ reference: 1 })
    .lean<Array<{ reference?: string | null }>>();

  return new Set(
    documents
      .map((document) => document.reference)
      .filter((reference): reference is string => Boolean(reference)),
  );
}

export async function findPropertyByReference(
  workspaceId: string,
  reference: string,
): Promise<PropertyRecord | null> {
  await connectDb();
  const document = await PropertyModel.findOne(
    withWorkspaceScope(workspaceId, { reference: reference.trim() }),
  ).lean<PropertyDocument>();
  return document ? toPropertyRecord(document) : null;
}

export async function createProperty(input: {
  workspaceId: string;
  projectId?: string | null;
  statusId: string;
  typeId?: string | null;
  ownerId?: string | null;
  assignedTo?: string | null;
  title: string;
  reference?: string | null;
  price?: number | null;
  currency: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  surface?: number | null;
  surfaceUnit?: SurfaceUnit;
  floor?: number | null;
  description?: string | null;
  features?: string[];
  tags?: string[];
  attributes?: Record<string, unknown>;
  createdBy: string;
}): Promise<PropertyRecord> {
  await connectDb();
  try {
    const document = await PropertyModel.create({
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      statusId: input.statusId,
      typeId: input.typeId ?? null,
      ownerId: input.ownerId ?? null,
      assignedTo: input.assignedTo ?? null,
      title: input.title.trim(),
      reference: input.reference?.trim() || null,
      price: input.price ?? null,
      currency: input.currency,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      rooms: input.rooms ?? null,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      surface: input.surface ?? null,
      surfaceUnit: input.surfaceUnit ?? "sqm",
      floor: input.floor ?? null,
      description: input.description?.trim() || null,
      features: input.features ?? [],
      tags: input.tags ?? [],
      attributes: input.attributes ?? {},
      createdBy: input.createdBy,
      archivedAt: null,
    });
    return toPropertyRecord(document.toObject() as PropertyDocument);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A property with this reference already exists in this workspace.",
      );
    }

    throw error;
  }
}

export async function updateProperty(
  workspaceId: string,
  propertyId: string,
  input: Partial<{
    projectId: string | null;
    statusId: string;
    typeId: string | null;
    ownerId: string | null;
    assignedTo: string | null;
    title: string;
    reference: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    city: string | null;
    country: string | null;
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    surface: number | null;
    surfaceUnit: SurfaceUnit;
    floor: number | null;
    description: string | null;
    features: string[];
    tags: string[];
    attributes: Record<string, unknown>;
  }>,
): Promise<PropertyRecord | null> {
  await connectDb();
  try {
    const document = await PropertyModel.findOneAndUpdate(
      withWorkspaceScope(workspaceId, { _id: propertyId, archivedAt: null }),
      { $set: input },
      { new: true },
    ).lean<PropertyDocument>();
    return document ? toPropertyRecord(document) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A property with this reference already exists in this workspace.",
      );
    }

    throw error;
  }
}

export async function archiveProperty(
  workspaceId: string,
  propertyId: string,
): Promise<PropertyRecord | null> {
  await connectDb();
  const document = await PropertyModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: propertyId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<PropertyDocument>();
  return document ? toPropertyRecord(document) : null;
}
