import "server-only";

import type { ImportErrorRowDetail, ImportRowIssue } from "@/lib/imports";
import { escapeCsvCell } from "@/server/imports/import-normalizers";
import type { ImportValidationResult } from "@/server/imports/import-validator";
import type { NormalizedImportRow } from "@/server/imports/import-entity-config";
import type { ImportRowResultRecord } from "@/server/repositories/import-jobs";

const MAX_EDITABLE_ERROR_ROWS = 100;
const MAX_VISIBLE_WARNING_ROWS = 100;

function rowValuesToStrings(row: NormalizedImportRow): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    values[key] = String(value);
  }

  return values;
}

export function buildImportErrorRowDetails(
  validation: ImportValidationResult,
): ImportErrorRowDetail[] {
  return validation.normalizedRows
    .filter((row) => row.status === "error")
    .slice(0, MAX_EDITABLE_ERROR_ROWS)
    .map((row) => ({
      rowNumber: row.rowNumber,
      values: rowValuesToStrings(row.rawRow),
      issues: row.issues.filter((issue) => issue.severity === "error"),
    }));
}

export function buildImportWarningRowDetails(
  validation: ImportValidationResult,
): ImportErrorRowDetail[] {
  return validation.normalizedRows
    .filter((row) => row.status === "warning")
    .slice(0, MAX_VISIBLE_WARNING_ROWS)
    .map((row) => ({
      rowNumber: row.rowNumber,
      values: rowValuesToStrings(row.rawRow),
      issues: row.issues.filter((issue) => issue.severity === "warning"),
    }));
}

export function buildImportErrorCsv(
  rowResults: ImportRowResultRecord[],
  headers: string[],
  dataRows: string[][],
): string {
  const csvHeaders = ["Row", "Status", "Message", ...headers];
  const lines = [csvHeaders.map(escapeCsvCell).join(",")];

  for (const result of rowResults) {
    if (result.status === "created") continue;

    const dataRow = dataRows[result.rowNumber - 1] ?? [];
    const messages = [
      ...result.errors.map((issue) => issue.message),
      ...result.warnings.map((issue) => issue.message),
    ];

    const message = messages.join("; ") || "Skipped";

    lines.push(
      [
        String(result.rowNumber),
        result.status,
        message,
        ...headers.map((_, index) => dataRow[index] ?? ""),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

export function summarizeImportIssues(issues: ImportRowIssue[], limit = 50): ImportRowIssue[] {
  const errors = issues.filter((issue) => issue.severity === "error" && issue.rowNumber > 0);
  return errors.slice(0, limit);
}
