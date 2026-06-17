import "server-only";

import { createLeadInputSchema } from "@/server/validation/leads";
import type {
  ImportContext,
  ImportEntityConfig,
  ImportFieldConfig,
  LeadImportInput,
  NormalizedImportRow,
} from "@/server/imports/import-entity-config";
import {
  isPropertyTypeInterest,
  isTransactionIntent,
  isUsagePurpose,
  normalizeEmailValue,
  normalizeLookupKey,
  normalizePhoneValue,
  parseCommaSeparatedList,
  parseOptionalCurrency,
  parseOptionalDate,
  parseOptionalNumber,
  resolveDictionaryId,
  resolveMemberId,
  resolveProjectId,
  resolveTagIds,
  splitFullName,
} from "@/server/imports/import-normalizers";
import { createLeadForWorkspace } from "@/server/services/leads";
import { AppError } from "@/server/errors";

const LEAD_FIELDS: ImportFieldConfig[] = [
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
    aliases: ["status", "lead status"],
    type: "dictionary",
    dictionaryType: "lead_status",
    supportsDefault: true,
  },
  {
    key: "firstName",
    label: "First Name",
    required: true,
    aliases: ["first name", "firstname", "given name"],
    type: "string",
  },
  {
    key: "lastName",
    label: "Last Name",
    required: true,
    aliases: ["last name", "lastname", "surname", "family name"],
    type: "string",
  },
  {
    key: "fullName",
    label: "Full Name",
    aliases: ["name", "full name", "contact name", "lead name"],
    type: "fullName",
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address", "e-mail"],
    type: "email",
  },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone", "phone number", "mobile", "telephone", "tel"],
    type: "phone",
  },
  {
    key: "sourceId",
    label: "Source",
    aliases: ["source", "lead source", "origin"],
    type: "dictionary",
    dictionaryType: "lead_source",
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
    aliases: ["assigned to", "agent", "assignee", "assigned"],
    type: "member",
    supportsDefault: true,
  },
  {
    key: "language",
    label: "Language",
    aliases: ["language", "lang"],
    type: "string",
  },
  {
    key: "preferredContactMethod",
    label: "Preferred Contact Method",
    aliases: ["preferred contact", "contact method"],
    type: "string",
  },
  {
    key: "budgetMin",
    label: "Budget Min",
    aliases: ["budget min", "min budget", "minimum budget"],
    type: "currency",
  },
  {
    key: "budgetMax",
    label: "Budget Max",
    aliases: ["budget", "budget max", "max budget", "maximum budget"],
    type: "currency",
  },
  {
    key: "preferredAreas",
    label: "Preferred Areas",
    aliases: ["preferred areas", "areas", "locations"],
    type: "array",
  },
  {
    key: "propertyTypeInterests",
    label: "Property Type Interests",
    aliases: ["property types", "property type interests"],
    type: "array",
  },
  {
    key: "transactionIntent",
    label: "Transaction Intent",
    aliases: ["transaction intent", "intent", "buy rent"],
    type: "string",
  },
  {
    key: "usagePurpose",
    label: "Usage Purpose",
    aliases: ["usage purpose", "purpose"],
    type: "string",
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "comments", "remarks", "membership notes"],
    type: "string",
  },
  {
    key: "createdAt",
    label: "Created Date",
    aliases: [
      "create date",
      "created date",
      "creation date",
      "date created",
      "created at",
      "created",
    ],
    type: "date",
    helpText: "Original lead creation date from the source system.",
  },
  {
    key: "tags",
    label: "Tags",
    aliases: ["tags", "labels"],
    type: "tags",
  },
  {
    key: "emailConsentStatus",
    label: "Email Consent",
    aliases: ["email consent", "consent"],
    type: "string",
  },
];

async function buildLeadCreateInput(
  row: NormalizedImportRow,
  context: ImportContext,
): Promise<LeadImportInput> {
  const input: Record<string, unknown> = { ...row };

  if (!input.firstName && !input.lastName && input.fullName) {
    const split = splitFullName(String(input.fullName));

    if (split) {
      input.firstName = split.firstName;
      input.lastName = split.lastName;
    }
  }

  delete input.fullName;

  if (input.projectId && typeof input.projectId === "string") {
    const resolved = resolveProjectId(context.projectLookup, input.projectId);
    if (resolved) input.projectId = resolved;
  }

  if (input.statusId && typeof input.statusId === "string") {
    const lookup = context.dictionaryLookup.get("lead_status");
    const resolved = lookup ? resolveDictionaryId(lookup, input.statusId) : undefined;
    if (resolved) input.statusId = resolved;
  }

  if (input.sourceId && typeof input.sourceId === "string") {
    const lookup = context.dictionaryLookup.get("lead_source");
    const resolved = lookup ? resolveDictionaryId(lookup, input.sourceId) : undefined;
    if (resolved) input.sourceId = resolved;
  }

  if (input.ownerId && typeof input.ownerId === "string") {
    const resolved = resolveMemberId(context.memberLookup, input.ownerId);
    if (resolved) input.ownerId = resolved;
  }

  if (input.assignedTo && typeof input.assignedTo === "string") {
    const resolved = resolveMemberId(context.memberLookup, input.assignedTo);
    if (resolved) input.assignedTo = resolved;
  }

  if (input.email && typeof input.email === "string") {
    input.email = normalizeEmailValue(input.email);
  }

  if (input.phone && typeof input.phone === "string") {
    input.phone = normalizePhoneValue(input.phone);
  }

  if (input.budgetMin !== undefined) {
    input.budgetMin = parseOptionalCurrency(input.budgetMin);
  }

  if (input.budgetMax !== undefined) {
    input.budgetMax = parseOptionalCurrency(input.budgetMax);
  }

  if (input.preferredAreas !== undefined) {
    input.preferredAreas = parseCommaSeparatedList(input.preferredAreas);
  }

  if (input.propertyTypeInterests !== undefined) {
    input.propertyTypeInterests = parseCommaSeparatedList(input.propertyTypeInterests)
      .map((value) => normalizeLookupKey(value).replace(/\s+/g, "_"))
      .filter(isPropertyTypeInterest);
  }

  if (input.transactionIntent && typeof input.transactionIntent === "string") {
    const normalized = normalizeLookupKey(input.transactionIntent).replace(/\s+/g, "_");
    input.transactionIntent = isTransactionIntent(normalized) ? normalized : undefined;
  }

  if (input.usagePurpose && typeof input.usagePurpose === "string") {
    const normalized = normalizeLookupKey(input.usagePurpose).replace(/\s+/g, "_");
    input.usagePurpose = isUsagePurpose(normalized) ? normalized : undefined;
  }

  if (input.tags !== undefined) {
    input.tags = resolveTagIds(context.tagLookup, input.tags);
  }

  if (input.createdAt !== undefined && input.createdAt !== "") {
    const parsedCreatedAt = parseOptionalDate(input.createdAt);
    if (!parsedCreatedAt) {
      throw new AppError("VALIDATION_ERROR", "Invalid created date.", {
        details: { field: "createdAt" },
      });
    }
    input.createdAt = parsedCreatedAt;
  } else {
    delete input.createdAt;
  }

  const parsed = createLeadInputSchema.safeParse(input);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AppError(
      "VALIDATION_ERROR",
      firstIssue?.message ?? "Invalid lead data.",
      {
        details: { field: firstIssue?.path.join(".") ?? "_root" },
      },
    );
  }

  return parsed.data;
}

export const leadImportConfig: ImportEntityConfig = {
  entityType: "lead",
  label: "Lead",
  requiredPermission: "lead:create",
  fields: LEAD_FIELDS,
  buildCreateInput: buildLeadCreateInput,
  async createRecord(input, context) {
    const leadInput = input as LeadImportInput;
    const result = await createLeadForWorkspace(
      context.workspaceId,
      context.actorId,
      leadInput,
    );

    return {
      entityId: result.lead.id,
      warnings: result.warnings,
    };
  },
};
