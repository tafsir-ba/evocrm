import "server-only";

import mongoose from "mongoose";

import type {
  ImportDefaults,
  ImportEntityType,
  ImportJobStatus,
  ImportMappingEntry,
  ImportRowIssue,
  ImportRowOverrides,
} from "@/lib/imports";
import type { ImportFileStorageProvider } from "@/server/imports/import-file-storage";
import { ImportJobModel, type ImportJobDocument } from "@/models/import-job";
import {
  findImportRowResults,
  replaceImportRowResults,
} from "@/server/repositories/import-row-results";
import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type ImportRowResultRecord = {
  rowNumber: number;
  status: "valid" | "created" | "skipped" | "failed";
  entityId: string | null;
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
};

export type ImportJobRecord = {
  id: string;
  workspaceId: string;
  entityType: ImportEntityType;
  status: ImportJobStatus;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  storageKey: string;
  storageProvider: ImportFileStorageProvider;
  sheetName: string | null;
  headerRowIndex: number;
  hasHeaderRow: boolean;
  detectedColumns: string[];
  previewRows: string[][];
  mappings: ImportMappingEntry[];
  defaults: ImportDefaults;
  rowOverrides: ImportRowOverrides;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  validationIssues: ImportRowIssue[];
  rowResults?: ImportRowResultRecord[];
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toImportJobRecord(
  document: ImportJobDocument,
  rowResults?: ImportRowResultRecord[],
): ImportJobRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    entityType: document.entityType,
    status: document.status,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    uploadedBy: document.uploadedBy.toString(),
    storageKey: document.storageKey,
    storageProvider: document.storageProvider as ImportFileStorageProvider,
    sheetName: document.sheetName ?? null,
    headerRowIndex: document.headerRowIndex ?? 0,
    hasHeaderRow: document.hasHeaderRow ?? true,
    detectedColumns: document.detectedColumns ?? [],
    previewRows: (document.previewRows ?? []).map((row) =>
      Array.from(row as unknown as string[]),
    ),
    mappings: (document.mappings ?? []).map((mapping) => ({
      sourceColumnIndex: mapping.sourceColumnIndex,
      targetField: mapping.targetField ?? null,
    })),
    defaults: (document.defaults ?? {}) as ImportDefaults,
    rowOverrides: (document.rowOverrides ?? {}) as ImportRowOverrides,
    totalRows: document.totalRows ?? 0,
    validRows: document.validRows ?? 0,
    warningRows: document.warningRows ?? 0,
    errorRows: document.errorRows ?? 0,
    validationIssues: (document.validationIssues ?? []).map((issue) => ({
      rowNumber: issue.rowNumber,
      field: issue.field ?? undefined,
      message: issue.message,
      severity: issue.severity as "error" | "warning",
    })),
    ...(rowResults ? { rowResults } : {}),
    createdCount: document.createdCount ?? 0,
    skippedCount: document.skippedCount ?? 0,
    failedCount: document.failedCount ?? 0,
    startedAt: document.startedAt ?? null,
    completedAt: document.completedAt ?? null,
    errorMessage: document.errorMessage ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createImportJob(input: {
  workspaceId: string;
  entityType: ImportEntityType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  storageKey: string;
  storageProvider: ImportFileStorageProvider;
  jobId?: string;
}): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.create({
    ...(input.jobId ? { _id: input.jobId } : {}),
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    status: "draft",
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    uploadedBy: input.uploadedBy,
    storageKey: input.storageKey,
    storageProvider: input.storageProvider,
  });

  return toImportJobRecord(document.toObject() as ImportJobDocument);
}

export async function findImportJobById(
  workspaceId: string,
  importJobId: string,
  options?: { includeRowResults?: boolean },
): Promise<ImportJobRecord | null> {
  await connectDb();

  if (!mongoose.isValidObjectId(importJobId)) {
    return null;
  }

  const document = await ImportJobModel.findOne(
    withWorkspaceScope(workspaceId, { _id: importJobId }),
  ).lean<ImportJobDocument>();

  if (!document) {
    return null;
  }

  const rowResults = options?.includeRowResults
    ? await findImportRowResults(workspaceId, importJobId)
    : undefined;

  return toImportJobRecord(document, rowResults);
}

const EXECUTABLE_IMPORT_STATUSES: ImportJobStatus[] = ["mapped", "ready"];

export const STALE_IMPORT_PROCESSING_MS = 30 * 60 * 1000;

export const MUTABLE_IMPORT_JOB_STATUSES: ImportJobStatus[] = ["draft", "mapped", "ready"];

export async function claimImportJobForExecution(
  importJobId: string,
  workspaceId: string,
): Promise<ImportJobRecord | null> {
  await connectDb();

  const staleBefore = new Date(Date.now() - STALE_IMPORT_PROCESSING_MS);

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      $or: [
        { status: { $in: EXECUTABLE_IMPORT_STATUSES } },
        {
          status: "processing",
          startedAt: { $lte: staleBefore },
        },
      ],
    }),
    {
      $set: {
        status: "processing",
        startedAt: new Date(),
        errorMessage: null,
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  return document ? toImportJobRecord(document) : null;
}

export async function releaseImportJobToReady(
  importJobId: string,
  workspaceId: string,
  input: {
    errorMessage: string;
    validRows: number;
    warningRows: number;
    errorRows: number;
    validationIssues: ImportRowIssue[];
  },
): Promise<ImportJobRecord | null> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: "processing",
    }),
    {
      $set: {
        status: "ready",
        errorMessage: input.errorMessage,
        validRows: input.validRows,
        warningRows: input.warningRows,
        errorRows: input.errorRows,
        validationIssues: input.validationIssues,
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  return document ? toImportJobRecord(document) : null;
}

export async function failImportJob(
  importJobId: string,
  workspaceId: string,
  errorMessage: string,
): Promise<void> {
  await connectDb();

  await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: "processing",
    }),
    {
      $set: {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      },
    },
  );
}

export async function updateImportJobParseResult(
  importJobId: string,
  workspaceId: string,
  input: {
    status: ImportJobStatus;
    sheetName: string | null;
    headerRowIndex: number;
    hasHeaderRow: boolean;
    detectedColumns: string[];
    previewRows: string[][];
    totalRows: number;
    mappings: ImportMappingEntry[];
  },
): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: { $in: MUTABLE_IMPORT_JOB_STATUSES },
    }),
    {
      $set: {
        status: input.status,
        sheetName: input.sheetName,
        headerRowIndex: input.headerRowIndex,
        hasHeaderRow: input.hasHeaderRow,
        detectedColumns: input.detectedColumns,
        previewRows: input.previewRows,
        totalRows: input.totalRows,
        mappings: input.mappings,
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError(
      "CONFLICT",
      "Import job cannot be updated in its current state.",
    );
  }

  return toImportJobRecord(document);
}

export async function updateImportJobMapping(
  importJobId: string,
  workspaceId: string,
  input: {
    mappings: ImportMappingEntry[];
    defaults: ImportDefaults;
    hasHeaderRow?: boolean;
    headerRowIndex?: number;
  },
): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: { $in: MUTABLE_IMPORT_JOB_STATUSES },
    }),
    {
      $set: {
        status: "mapped",
        mappings: input.mappings,
        defaults: input.defaults,
        rowOverrides: {},
        ...(input.hasHeaderRow !== undefined ? { hasHeaderRow: input.hasHeaderRow } : {}),
        ...(input.headerRowIndex !== undefined ? { headerRowIndex: input.headerRowIndex } : {}),
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError(
      "CONFLICT",
      "Import job cannot be updated in its current state.",
    );
  }

  return toImportJobRecord(document);
}

export async function updateImportJobValidation(
  importJobId: string,
  workspaceId: string,
  input: {
    status: ImportJobStatus;
    validRows: number;
    warningRows: number;
    errorRows: number;
    validationIssues: ImportRowIssue[];
    rowOverrides?: ImportRowOverrides;
  },
): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: { $in: MUTABLE_IMPORT_JOB_STATUSES },
    }),
    {
      $set: {
        status: input.status,
        validRows: input.validRows,
        warningRows: input.warningRows,
        errorRows: input.errorRows,
        validationIssues: input.validationIssues,
        ...(input.rowOverrides !== undefined ? { rowOverrides: input.rowOverrides } : {}),
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError(
      "CONFLICT",
      "Import job cannot be validated in its current state.",
    );
  }

  return toImportJobRecord(document);
}

export async function updateImportJobProcessingValidation(
  importJobId: string,
  workspaceId: string,
  input: {
    validRows: number;
    warningRows: number;
    errorRows: number;
    validationIssues: ImportRowIssue[];
  },
): Promise<void> {
  await connectDb();

  await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: importJobId,
      status: "processing",
    }),
    {
      $set: {
        validRows: input.validRows,
        warningRows: input.warningRows,
        errorRows: input.errorRows,
        validationIssues: input.validationIssues,
      },
    },
  );
}

export async function updateImportJobStatus(
  importJobId: string,
  workspaceId: string,
  input: {
    status: ImportJobStatus;
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string | null;
  },
): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: importJobId }),
    { $set: input },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Import job not found.");
  }

  return toImportJobRecord(document);
}

export async function updateImportJobExecution(
  importJobId: string,
  workspaceId: string,
  input: {
    status: ImportJobStatus;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    rowResults: ImportRowResultRecord[];
    completedAt: Date;
  },
): Promise<ImportJobRecord> {
  await connectDb();

  await replaceImportRowResults(workspaceId, importJobId, input.rowResults);

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: importJobId, status: "processing" }),
    {
      $set: {
        status: input.status,
        createdCount: input.createdCount,
        skippedCount: input.skippedCount,
        failedCount: input.failedCount,
        completedAt: input.completedAt,
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError(
      "CONFLICT",
      "Import job cannot be finalized in its current state.",
    );
  }

  return toImportJobRecord(document, input.rowResults);
}
