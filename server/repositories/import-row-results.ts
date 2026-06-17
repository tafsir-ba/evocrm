import "server-only";

import mongoose from "mongoose";

import { ImportRowResultModel, type ImportRowResultDocument } from "@/models/import-row-result";
import { connectDb } from "@/server/db/mongoose";
import type { ImportRowResultRecord } from "@/server/repositories/import-jobs";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

function toImportRowResultRecord(
  document: {
    rowNumber: number;
    status: string;
    entityId?: string | null;
    errors?: Array<{
      rowNumber: number;
      field?: string | null;
      message: string;
      severity: string;
    }>;
    warnings?: Array<{
      rowNumber: number;
      field?: string | null;
      message: string;
      severity: string;
    }>;
  },
): ImportRowResultRecord {
  return {
    rowNumber: document.rowNumber,
    status: document.status as ImportRowResultRecord["status"],
    entityId: document.entityId ?? null,
    errors: (document.errors ?? []).map((issue) => ({
      rowNumber: issue.rowNumber,
      field: issue.field ?? undefined,
      message: issue.message,
      severity: issue.severity as "error" | "warning",
    })),
    warnings: (document.warnings ?? []).map((issue) => ({
      rowNumber: issue.rowNumber,
      field: issue.field ?? undefined,
      message: issue.message,
      severity: issue.severity as "error" | "warning",
    })),
  };
}

function toStoredRowIssues(
  issues: ImportRowResultRecord["errors"],
): Array<{
  rowNumber: number;
  field: string | null;
  message: string;
  severity: "error" | "warning";
}> {
  return issues.map((issue) => ({
    rowNumber: issue.rowNumber,
    field: issue.field ?? null,
    message: issue.message,
    severity: issue.severity,
  }));
}

export async function replaceImportRowResults(
  workspaceId: string,
  importJobId: string,
  rowResults: ImportRowResultRecord[],
): Promise<void> {
  await connectDb();

  if (rowResults.length === 0) {
    await ImportRowResultModel.deleteMany(
      withWorkspaceScope(workspaceId, { importJobId }),
    );
    return;
  }

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const importJobObjectId = new mongoose.Types.ObjectId(importJobId);
  const operations = rowResults.map((result) => ({
    updateOne: {
      filter: {
        workspaceId: workspaceObjectId,
        importJobId: importJobObjectId,
        rowNumber: result.rowNumber,
      },
      update: {
        $set: {
          workspaceId: workspaceObjectId,
          importJobId: importJobObjectId,
          rowNumber: result.rowNumber,
          status: result.status,
          entityId: result.entityId,
          errors: toStoredRowIssues(result.errors),
          warnings: toStoredRowIssues(result.warnings),
        },
      },
      upsert: true,
    },
  })) as mongoose.mongo.AnyBulkWriteOperation<ImportRowResultDocument>[];

  await ImportRowResultModel.bulkWrite(
    operations as Parameters<typeof ImportRowResultModel.bulkWrite>[0],
  );

  const rowNumbers = rowResults.map((result) => result.rowNumber);

  await ImportRowResultModel.deleteMany({
    workspaceId: workspaceObjectId,
    importJobId: importJobObjectId,
    rowNumber: { $nin: rowNumbers },
  });
}

export async function findImportRowResults(
  workspaceId: string,
  importJobId: string,
): Promise<ImportRowResultRecord[]> {
  await connectDb();

  if (!mongoose.isValidObjectId(importJobId)) {
    return [];
  }

  const documents = await ImportRowResultModel.find(
    withWorkspaceScope(workspaceId, { importJobId }),
  )
    .sort({ rowNumber: 1 })
    .lean();

  return documents.map((document) => toImportRowResultRecord(document));
}
