import type {
  ImportDefaults,
  ImportFieldConfigResponse,
  ImportMappingEntry,
  ImportRowIssue,
  ImportRowOverrides,
} from "@/lib/imports";

export function validateImportMappingConfiguration(
  fields: ImportFieldConfigResponse[],
  mappings: ImportMappingEntry[],
  defaults: ImportDefaults,
): ImportRowIssue[] {
  const issues: ImportRowIssue[] = [];
  const mappedFields = new Set<string>();
  const validFieldKeys = new Set(fields.map((field) => field.key));

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;

    if (!validFieldKeys.has(mapping.targetField)) {
      issues.push({
        rowNumber: 0,
        field: mapping.targetField,
        message: `Unknown CRM field "${mapping.targetField}".`,
        severity: "error",
      });
      continue;
    }

    if (mappedFields.has(mapping.targetField)) {
      issues.push({
        rowNumber: 0,
        field: mapping.targetField,
        message: `Field "${mapping.targetField}" is mapped more than once.`,
        severity: "error",
      });
    }

    mappedFields.add(mapping.targetField);
  }

  for (const field of fields) {
    if (!field.required) continue;

    const isMapped = mappedFields.has(field.key);
    const hasDefault = Boolean(defaults[field.key]);
    const satisfiedByFullName =
      (field.key === "firstName" || field.key === "lastName") &&
      (mappedFields.has("fullName") || Boolean(defaults.fullName));

    if (!isMapped && !hasDefault && !satisfiedByFullName) {
      issues.push({
        rowNumber: 0,
        field: field.key,
        message: `Required field "${field.label}" must be mapped or have a default value.`,
        severity: "error",
      });
    }
  }

  for (const [key] of Object.entries(defaults)) {
    if (!validFieldKeys.has(key)) {
      issues.push({
        rowNumber: 0,
        field: key,
        message: `Unknown default field "${key}".`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function sanitizeRowOverrides(
  fields: ImportFieldConfigResponse[],
  rowOverrides: ImportRowOverrides,
): ImportRowOverrides {
  const validFieldKeys = new Set(fields.map((field) => field.key));
  const sanitized: ImportRowOverrides = {};

  for (const [rowKey, overrides] of Object.entries(rowOverrides)) {
    const rowNumber = Number(rowKey);

    if (!Number.isInteger(rowNumber) || rowNumber < 1) {
      continue;
    }

    const cleaned: Record<string, string> = {};

    for (const [fieldKey, value] of Object.entries(overrides)) {
      if (validFieldKeys.has(fieldKey)) {
        cleaned[fieldKey] = value;
      }
    }

    if (Object.keys(cleaned).length > 0) {
      sanitized[String(rowNumber)] = cleaned;
    }
  }

  return sanitized;
}

export function sanitizeImportMappingPayload(input: {
  mappings: ImportMappingEntry[];
  defaults: ImportDefaults;
}): {
  mappings: ImportMappingEntry[];
  defaults: ImportDefaults;
} {
  return {
    mappings: input.mappings.map((mapping) => ({
      sourceColumnIndex: mapping.sourceColumnIndex,
      targetField: mapping.targetField?.trim() ? mapping.targetField : null,
    })),
    defaults: Object.fromEntries(
      Object.entries(input.defaults).filter(([, value]) => Boolean(value?.trim())),
    ),
  };
}
