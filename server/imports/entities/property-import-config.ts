import "server-only";

import { createPropertyInputSchema } from "@/server/validation/properties";
import type {
  ImportContext,
  ImportEntityConfig,
  ImportFieldConfig,
  NormalizedImportRow,
  PropertyImportInput,
} from "@/server/imports/import-entity-config";
import {
  isSurfaceUnit,
  normalizeLookupKey,
  normalizeReferenceValue,
  parseCommaSeparatedList,
  parseOptionalCurrency,
  parseOptionalNumber,
  resolveDictionaryId,
  resolveMemberId,
  resolveProjectId,
  resolveTagIds,
} from "@/server/imports/import-normalizers";
import { createPropertyForWorkspace } from "@/server/services/properties";
import { AppError } from "@/server/errors";

const PROPERTY_FIELDS: ImportFieldConfig[] = [
  {
    key: "projectId",
    label: "Project",
    required: true,
    aliases: ["project", "development", "building"],
    type: "project",
    supportsDefault: true,
  },
  {
    key: "statusId",
    label: "Status",
    required: true,
    aliases: ["status", "property status"],
    type: "dictionary",
    dictionaryType: "property_status",
    supportsDefault: true,
  },
  {
    key: "title",
    label: "Title",
    required: true,
    aliases: ["title", "property name", "name", "unit name"],
    type: "string",
  },
  {
    key: "typeId",
    label: "Type",
    aliases: ["type", "property type"],
    type: "dictionary",
    dictionaryType: "property_type",
    supportsDefault: true,
  },
  {
    key: "ownerId",
    label: "Owner",
    aliases: ["owner"],
    type: "member",
    supportsDefault: true,
  },
  {
    key: "assignedTo",
    label: "Assigned To",
    aliases: ["assigned to", "agent", "assignee"],
    type: "member",
    supportsDefault: true,
  },
  {
    key: "reference",
    label: "Reference",
    aliases: ["reference", "ref", "unit number", "unit id", "unit"],
    type: "string",
  },
  {
    key: "price",
    label: "Price",
    aliases: ["price", "asking price", "sale price"],
    type: "currency",
  },
  {
    key: "currency",
    label: "Currency",
    aliases: ["currency"],
    type: "string",
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "street"],
    type: "string",
  },
  {
    key: "city",
    label: "City",
    aliases: ["city", "town"],
    type: "string",
  },
  {
    key: "country",
    label: "Country",
    aliases: ["country"],
    type: "string",
  },
  {
    key: "rooms",
    label: "Rooms",
    aliases: ["rooms", "property units", "number of rooms", "units"],
    type: "number",
  },
  {
    key: "bedrooms",
    label: "Bedrooms",
    aliases: ["bedrooms", "beds"],
    type: "number",
  },
  {
    key: "bathrooms",
    label: "Bathrooms",
    aliases: ["bathrooms", "baths"],
    type: "number",
  },
  {
    key: "surface",
    label: "Surface",
    aliases: ["surface", "area", "size", "sqm", "sqft"],
    type: "number",
  },
  {
    key: "surfaceUnit",
    label: "Surface Unit",
    aliases: ["surface unit"],
    type: "string",
  },
  {
    key: "floor",
    label: "Floor",
    aliases: ["floor", "level"],
    type: "number",
  },
  {
    key: "description",
    label: "Description",
    aliases: ["description", "details"],
    type: "string",
  },
  {
    key: "features",
    label: "Features",
    aliases: ["features", "amenities"],
    type: "array",
  },
  {
    key: "tags",
    label: "Tags",
    aliases: ["tags", "labels"],
    type: "tags",
  },
];

async function buildPropertyCreateInput(
  row: NormalizedImportRow,
  context: ImportContext,
): Promise<PropertyImportInput> {
  const input: Record<string, unknown> = { ...row };

  if (input.projectId && typeof input.projectId === "string") {
    const resolved = resolveProjectId(context.projectLookup, input.projectId);
    if (resolved) input.projectId = resolved;
  }

  if (input.statusId && typeof input.statusId === "string") {
    const lookup = context.dictionaryLookup.get("property_status");
    const resolved = lookup ? resolveDictionaryId(lookup, input.statusId) : undefined;
    if (resolved) input.statusId = resolved;
  }

  if (input.typeId && typeof input.typeId === "string") {
    const lookup = context.dictionaryLookup.get("property_type");
    const resolved = lookup ? resolveDictionaryId(lookup, input.typeId) : undefined;
    if (resolved) input.typeId = resolved;
  }

  if (input.ownerId && typeof input.ownerId === "string") {
    const resolved = resolveMemberId(context.memberLookup, input.ownerId);
    if (resolved) input.ownerId = resolved;
  }

  if (input.assignedTo && typeof input.assignedTo === "string") {
    const resolved = resolveMemberId(context.memberLookup, input.assignedTo);
    if (resolved) input.assignedTo = resolved;
  }

  if (input.reference !== undefined) {
    input.reference = normalizeReferenceValue(input.reference);
  }

  if (input.price !== undefined) {
    input.price = parseOptionalCurrency(input.price);
  }

  if (input.rooms !== undefined) {
    input.rooms = parseOptionalNumber(input.rooms);
  }

  if (input.bedrooms !== undefined) {
    input.bedrooms = parseOptionalNumber(input.bedrooms);
  }

  if (input.bathrooms !== undefined) {
    input.bathrooms = parseOptionalNumber(input.bathrooms);
  }

  if (input.surface !== undefined) {
    input.surface = parseOptionalNumber(input.surface);
  }

  if (input.floor !== undefined) {
    input.floor = parseOptionalNumber(input.floor);
  }

  if (input.surfaceUnit && typeof input.surfaceUnit === "string") {
    const normalized = normalizeLookupKey(input.surfaceUnit);
    input.surfaceUnit = isSurfaceUnit(normalized) ? normalized : undefined;
  }

  if (input.features !== undefined) {
    input.features = parseCommaSeparatedList(input.features);
  }

  if (input.tags !== undefined) {
    input.tags = resolveTagIds(context.tagLookup, input.tags);
  }

  const parsed = createPropertyInputSchema.safeParse(input);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AppError(
      "VALIDATION_ERROR",
      firstIssue?.message ?? "Invalid property data.",
      {
        details: { field: firstIssue?.path.join(".") ?? "_root" },
      },
    );
  }

  return parsed.data;
}

export const propertyImportConfig: ImportEntityConfig = {
  entityType: "property",
  label: "Property",
  requiredPermission: "property:create",
  fields: PROPERTY_FIELDS,
  buildCreateInput: buildPropertyCreateInput,
  async createRecord(input, context) {
    const propertyInput = input as PropertyImportInput;
    const property = await createPropertyForWorkspace(
      context.workspaceId,
      context.actorId,
      propertyInput,
      context.defaultCurrency,
    );

    return {
      entityId: property.id,
      warnings: [],
    };
  },
};
