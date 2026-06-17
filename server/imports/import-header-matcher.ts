import "server-only";

import type { ImportFieldConfig } from "@/server/imports/import-entity-config";

export function normalizeHeaderName(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestMappingsForHeaders(
  headers: string[],
  fields: ImportFieldConfig[],
): Array<string | null> {
  const usedFields = new Set<string>();

  return headers.map((header) => {
    const suggestion = suggestFieldForHeader(header, fields);

    if (suggestion && !usedFields.has(suggestion)) {
      usedFields.add(suggestion);
      return suggestion;
    }

    return null;
  });
}

export function suggestFieldForHeader(
  header: string,
  fields: ImportFieldConfig[],
): string | null {
  const normalized = normalizeHeaderName(header);

  if (!normalized) {
    return null;
  }

  for (const field of fields) {
    if (normalizeHeaderName(field.key) === normalized) {
      return field.key;
    }
  }

  for (const field of fields) {
    for (const alias of field.aliases) {
      if (normalizeHeaderName(alias) === normalized) {
        return field.key;
      }
    }
  }

  for (const field of fields) {
    for (const alias of field.aliases) {
      const normalizedAlias = normalizeHeaderName(alias);
      if (
        normalized.includes(normalizedAlias) ||
        normalizedAlias.includes(normalized)
      ) {
        return field.key;
      }
    }
  }

  return null;
}
