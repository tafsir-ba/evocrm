import "server-only";

import type { ImportExecuteMode } from "@/lib/imports";
import { AppError } from "@/server/errors";
import type { ImportEntityConfig, ImportContext } from "@/server/imports/import-entity-config";
import type { ImportValidationResult } from "@/server/imports/import-validator";
import {
  updateImportJobExecution,
  type ImportJobRecord,
  type ImportRowResultRecord,
} from "@/server/repositories/import-jobs";

const BATCH_SIZE = 100;

export async function executeImportJob(
  job: ImportJobRecord,
  entityConfig: ImportEntityConfig,
  context: ImportContext,
  validation: ImportValidationResult,
  mode: ImportExecuteMode,
): Promise<{
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  rowResults: ImportRowResultRecord[];
}> {
  if (mode === "strict" && validation.summary.errorRows > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Import cannot proceed in strict mode while rows have errors.",
    );
  }

  const rowResults: ImportRowResultRecord[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < validation.normalizedRows.length; index += BATCH_SIZE) {
    const batch = validation.normalizedRows.slice(index, index + BATCH_SIZE);

    for (const rowResult of batch) {
      if (rowResult.status === "error") {
        skippedCount += 1;
        rowResults.push({
          rowNumber: rowResult.rowNumber,
          status: "skipped",
          entityId: null,
          errors: rowResult.issues.filter((issue) => issue.severity === "error"),
          warnings: rowResult.issues.filter((issue) => issue.severity === "warning"),
        });
        continue;
      }

      try {
        const createInput = await entityConfig.buildCreateInput(rowResult.row, context);
        const created = await entityConfig.createRecord(createInput, context);

        createdCount += 1;
        rowResults.push({
          rowNumber: rowResult.rowNumber,
          status: "created",
          entityId: created.entityId,
          errors: [],
          warnings: [
            ...rowResult.issues.filter((issue) => issue.severity === "warning"),
            ...created.warnings.map((warning) => ({
              rowNumber: rowResult.rowNumber,
              message: warning,
              severity: "warning" as const,
            })),
          ],
        });
      } catch (error) {
        const isDuplicate =
          error instanceof AppError && error.code === "CONFLICT";

        if (isDuplicate) {
          skippedCount += 1;
          rowResults.push({
            rowNumber: rowResult.rowNumber,
            status: "skipped",
            entityId: null,
            errors: [
              {
                rowNumber: rowResult.rowNumber,
                message: error.message,
                severity: "error",
              },
            ],
            warnings: rowResult.issues.filter((issue) => issue.severity === "warning"),
          });
          continue;
        }

        failedCount += 1;
        const message =
          error instanceof AppError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to create record.";

        rowResults.push({
          rowNumber: rowResult.rowNumber,
          status: "failed",
          entityId: null,
          errors: [
            {
              rowNumber: rowResult.rowNumber,
              message,
              severity: "error",
            },
          ],
          warnings: rowResult.issues.filter((issue) => issue.severity === "warning"),
        });
      }
    }
  }

  const finalStatus =
    failedCount > 0 || skippedCount > 0 ? "completed_with_errors" : "completed";

  await updateImportJobExecution(job.id, job.workspaceId, {
    status: finalStatus,
    createdCount,
    skippedCount,
    failedCount,
    rowResults,
    completedAt: new Date(),
  });

  return {
    createdCount,
    skippedCount,
    failedCount,
    rowResults,
  };
}
