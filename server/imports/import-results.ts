import "server-only";

import type { ImportRowIssue } from "@/lib/imports";
import { escapeCsvCell } from "@/server/imports/import-normalizers";
import type { ImportRowResultRecord } from "@/server/repositories/import-jobs";

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
