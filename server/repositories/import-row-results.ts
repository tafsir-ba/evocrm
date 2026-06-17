import "server-only";

import mongoose from "mongoose";

import { ImportRowResultModel } from "@/models/import-row-result";
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

export async function replaceImportRowResults(
  workspaceId: string,
  importJobId: string,
  rowResults: ImportRowResultRecord[],
): Promise<void> {
  await connectDb();

  await ImportRowResultModel.deleteMany(
    withWorkspaceScope(workspaceId, { importJobId }),
  );

  if (rowResults.length === 0) {
    return;
  }

  await ImportRowResultModel.insertMany(
    rowResults.map((result) => ({
      workspaceId,
      importJobId,
      rowNumber: result.rowNumber,
      status: result.status,
      entityId: result.entityId,
      errors: result.errors,
      warnings: result.warnings,
    })),
  );
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
