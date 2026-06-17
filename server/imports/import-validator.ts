import "server-only";

import type {
  ImportDefaults,
  ImportMappingEntry,
  ImportRowIssue,
  ImportValidationSummary,
} from "@/lib/imports";
import { validateImportMappingConfiguration } from "@/lib/import-mapping-validation";
import { findDictionaryItems } from "@/server/repositories/dictionary-items";
import { findActiveLeadsByEmailNormalized } from "@/server/repositories/leads";
import { listWorkspaceMembersForWorkspace } from "@/server/services/members";
import { findPropertiesByReferences } from "@/server/repositories/properties";
import { findProjects } from "@/server/repositories/projects";
import { findTags } from "@/server/repositories/tags";
import type {
  ImportContext,
  ImportEntityConfig,
  ImportFieldConfig,
  NormalizedImportRow,
} from "@/server/imports/import-entity-config";
import {
  isValidEmail,
  normalizeEmailValue,
  normalizeLookupKey,
  normalizeReferenceValue,
  parseOptionalCurrency,
  parseOptionalDate,
  parseOptionalNumber,
  splitFullName,
} from "@/server/imports/import-normalizers";
import { AppError } from "@/server/errors";
import { normalizeLeadEmail } from "@/server/services/leads";

export type ImportValidationResult = {
  summary: ImportValidationSummary;
  issues: ImportRowIssue[];
  normalizedRows: Array<{
    rowNumber: number;
    row: NormalizedImportRow;
    status: "valid" | "warning" | "error";
    issues: ImportRowIssue[];
  }>;
};

export async function buildImportContext(
  workspaceId: string,
  actorId: string,
  defaultCurrency: string,
  entityConfig: ImportEntityConfig,
): Promise<ImportContext> {
  const dictionaryTypes = new Set(
    entityConfig.fields
      .map((field) => field.dictionaryType)
      .filter((type): type is string => Boolean(type)),
  );

  const [dictionaryItems, projects, members, tags] = await Promise.all([
    findDictionaryItems(workspaceId),
    findProjects(workspaceId, { includeArchived: false }),
    listWorkspaceMembersForWorkspace(workspaceId),
    findTags(workspaceId, { includeArchived: false }),
  ]);

  const dictionaryLookup = new Map<string, Map<string, string>>();

  for (const type of dictionaryTypes) {
    const lookup = new Map<string, string>();

    for (const item of dictionaryItems) {
      if (item.type !== type || !item.isActive) continue;
      lookup.set(normalizeLookupKey(item.label), item.id);
      lookup.set(normalizeLookupKey(item.key), item.id);
    }

    dictionaryLookup.set(type, lookup);
  }

  const projectLookup = new Map<string, string>();
  for (const project of projects) {
    projectLookup.set(normalizeLookupKey(project.name), project.id);
    if (project.reference) {
      projectLookup.set(normalizeLookupKey(project.reference), project.id);
    }
    projectLookup.set(project.id, project.id);
  }

  const memberLookup = new Map<string, string>();
  for (const member of members) {
    memberLookup.set(member.userId, member.userId);
    memberLookup.set(normalizeLookupKey(member.email), member.userId);
    if (member.name) {
      memberLookup.set(normalizeLookupKey(member.name), member.userId);
    }
  }

  const tagEntityType = entityConfig.entityType === "lead" ? "lead" : "property";
  const tagLookup = new Map<string, string>();
  for (const tag of tags) {
    if (!tag.entityTypes.includes(tagEntityType)) continue;
    tagLookup.set(normalizeLookupKey(tag.name), tag.id);
  }

  return {
    workspaceId,
    actorId,
    defaultCurrency,
    dictionaryLookup,
    projectLookup,
    memberLookup,
    tagLookup,
  };
}

export function validateMappingConfiguration(
  entityConfig: ImportEntityConfig,
  mappings: ImportMappingEntry[],
  defaults: ImportDefaults,
): ImportRowIssue[] {
  return validateImportMappingConfiguration(
    entityConfig.fields.map((field) => ({
      key: field.key,
      label: field.label,
      required: field.required ?? false,
      aliases: field.aliases,
      type: field.type,
      helpText: field.helpText,
      dictionaryType: field.dictionaryType,
      supportsDefault: field.supportsDefault ?? false,
    })),
    mappings,
    defaults,
  );
}

export function mapRowFromSource(
  dataRow: string[],
  headers: string[],
  mappings: ImportMappingEntry[],
  defaults: ImportDefaults,
): NormalizedImportRow {
  const row: NormalizedImportRow = { ...defaults };

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;

    const value = dataRow[mapping.sourceColumnIndex];

    if (value !== undefined && value !== "") {
      row[mapping.targetField] = value;
    }
  }

  return row;
}

export async function validateImportRows(
  entityConfig: ImportEntityConfig,
  context: ImportContext,
  headers: string[],
  dataRows: string[][],
  mappings: ImportMappingEntry[],
  defaults: ImportDefaults,
): Promise<ImportValidationResult> {
  const issues: ImportRowIssue[] = [];
  const normalizedRows: ImportValidationResult["normalizedRows"] = [];

  const seenEmails = new Map<string, number>();
  const seenReferences = new Map<string, number>();

  const leadEmailsToCheck: string[] = [];
  const propertyReferencesToCheck: string[] = [];

  if (entityConfig.entityType === "lead") {
    for (const dataRow of dataRows) {
      const rawRow = mapRowFromSource(dataRow, headers, mappings, defaults);
      if (!rawRow.email || typeof rawRow.email !== "string") continue;
      try {
        leadEmailsToCheck.push(normalizeLeadEmail(rawRow.email).emailNormalized);
      } catch {
        // Invalid emails are handled during row validation.
      }
    }
  }

  if (entityConfig.entityType === "property") {
    for (const dataRow of dataRows) {
      const rawRow = mapRowFromSource(dataRow, headers, mappings, defaults);
      const reference = normalizeReferenceValue(rawRow.reference);
      if (reference) {
        propertyReferencesToCheck.push(reference);
      }
    }
  }

  const existingLeadEmails =
    entityConfig.entityType === "lead"
      ? await findActiveLeadsByEmailNormalized(context.workspaceId, leadEmailsToCheck)
      : new Set<string>();

  const existingPropertyReferences =
    entityConfig.entityType === "property"
      ? await findPropertiesByReferences(context.workspaceId, propertyReferencesToCheck)
      : new Set<string>();

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowNumber = index + 1;
    const dataRow = dataRows[index] ?? [];
    const rowIssues: ImportRowIssue[] = [];
    const rawRow = mapRowFromSource(dataRow, headers, mappings, defaults);

    validateRawRow(entityConfig.fields, rawRow, rowIssues, rowNumber);

    let normalizedRow: NormalizedImportRow = { ...rawRow };

    try {
      normalizedRow = (await entityConfig.buildCreateInput(
        rawRow,
        context,
      )) as NormalizedImportRow;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid row data.";
      const field =
        error instanceof AppError &&
        error.details &&
        typeof error.details.field === "string"
          ? error.details.field
          : undefined;

      rowIssues.push({
        rowNumber,
        field,
        message,
        severity: "error",
      });
    }

    if (entityConfig.entityType === "lead") {
      validateLeadDuplicates(
        normalizedRow,
        rowNumber,
        rowIssues,
        seenEmails,
        existingLeadEmails,
      );
    }

    if (entityConfig.entityType === "property") {
      validatePropertyDuplicates(
        normalizedRow,
        rowNumber,
        rowIssues,
        seenReferences,
        existingPropertyReferences,
      );
    }

    const hasError = rowIssues.some((issue) => issue.severity === "error");
    const hasWarning = rowIssues.some((issue) => issue.severity === "warning");

    normalizedRows.push({
      rowNumber,
      row: normalizedRow,
      status: hasError ? "error" : hasWarning ? "warning" : "valid",
      issues: rowIssues,
    });

    issues.push(...rowIssues);
  }

  const errorRows = normalizedRows.filter((row) => row.status === "error").length;
  const warningRows = normalizedRows.filter((row) => row.status === "warning").length;
  const validRows = normalizedRows.length - errorRows;

  return {
    summary: {
      totalRows: dataRows.length,
      validRows,
      warningRows,
      errorRows,
    },
    issues,
    normalizedRows,
  };
}

function validateRawRow(
  fields: ImportFieldConfig[],
  row: NormalizedImportRow,
  issues: ImportRowIssue[],
  rowNumber: number,
): void {
  const fieldMap = new Map(fields.map((field) => [field.key, field]));

  if (row.fullName && !row.firstName && !row.lastName) {
    const split = splitFullName(String(row.fullName));

    if (!split || !split.firstName) {
      issues.push({
        rowNumber,
        field: "fullName",
        message: "Full name could not be split into first and last name.",
        severity: "warning",
      });
    }
  }

  if (row.email !== undefined && row.email !== "") {
    const email = normalizeEmailValue(row.email);

    if (!email || !isValidEmail(email)) {
      issues.push({
        rowNumber,
        field: "email",
        message: "Invalid email address.",
        severity: "error",
      });
    }
  }

  const numericFields = ["budgetMin", "budgetMax", "price", "rooms", "bedrooms", "bathrooms", "surface", "floor"];

  for (const key of numericFields) {
    if (row[key] === undefined || row[key] === "") continue;

    const field = fieldMap.get(key);
    const parser = field?.type === "currency" ? parseOptionalCurrency : parseOptionalNumber;
    const parsed = parser(row[key]);

    if (parsed === undefined) {
      issues.push({
        rowNumber,
        field: key,
        message: `Invalid number for ${field?.label ?? key}.`,
        severity: "error",
      });
    }
  }

  for (const field of fields) {
    if (field.type !== "date") continue;
    if (row[field.key] === undefined || row[field.key] === "") continue;

    if (parseOptionalDate(row[field.key]) === undefined) {
      issues.push({
        rowNumber,
        field: field.key,
        message: `Invalid date for ${field.label}.`,
        severity: "error",
      });
    }
  }
}

function validateLeadDuplicates(
  row: NormalizedImportRow,
  rowNumber: number,
  issues: ImportRowIssue[],
  seenEmails: Map<string, number>,
  existingLeadEmails: Set<string>,
): void {
  if (!row.email || typeof row.email !== "string") {
    return;
  }

  let emailNormalized: string;

  try {
    emailNormalized = normalizeLeadEmail(row.email).emailNormalized;
  } catch {
    return;
  }

  const inFileDuplicate = seenEmails.get(emailNormalized);

  if (inFileDuplicate !== undefined) {
    issues.push({
      rowNumber,
      field: "email",
      message: `Duplicate email in file (also on row ${inFileDuplicate}).`,
      severity: "error",
    });
  } else {
    seenEmails.set(emailNormalized, rowNumber);
  }

  if (existingLeadEmails.has(emailNormalized)) {
    issues.push({
      rowNumber,
      field: "email",
      message: "A lead with this email already exists in this workspace.",
      severity: "error",
    });
  }
}

function validatePropertyDuplicates(
  row: NormalizedImportRow,
  rowNumber: number,
  issues: ImportRowIssue[],
  seenReferences: Map<string, number>,
  existingPropertyReferences: Set<string>,
): void {
  if (!row.reference || typeof row.reference !== "string") {
    return;
  }

  const reference = normalizeReferenceValue(row.reference);

  if (!reference) {
    return;
  }

  const inFileDuplicate = seenReferences.get(reference);

  if (inFileDuplicate !== undefined) {
    issues.push({
      rowNumber,
      field: "reference",
      message: `Duplicate reference in file (also on row ${inFileDuplicate}).`,
      severity: "error",
    });
  } else {
    seenReferences.set(reference, rowNumber);
  }

  if (existingPropertyReferences.has(reference)) {
    issues.push({
      rowNumber,
      field: "reference",
      message: "A property with this reference already exists in this workspace.",
      severity: "error",
    });
  }
}
