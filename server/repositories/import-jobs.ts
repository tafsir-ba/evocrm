import "server-only";

import mongoose from "mongoose";

import type {
  ImportDefaults,
  ImportEntityType,
  ImportJobStatus,
  ImportMappingEntry,
  ImportRowIssue,
} from "@/lib/imports";
import { ImportJobModel, type ImportJobDocument } from "@/models/import-job";
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
  fileData: Buffer;
  sheetName: string | null;
  headerRowIndex: number;
  hasHeaderRow: boolean;
  detectedColumns: string[];
  previewRows: string[][];
  mappings: ImportMappingEntry[];
  defaults: ImportDefaults;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  validationIssues: ImportRowIssue[];
  rowResults: ImportRowResultRecord[];
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toImportJobRecord(document: ImportJobDocument): ImportJobRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    entityType: document.entityType,
    status: document.status,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    uploadedBy: document.uploadedBy.toString(),
    fileData: document.fileData,
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
    rowResults: (document.rowResults ?? []).map((result) => ({
      rowNumber: result.rowNumber,
      status: result.status as ImportRowResultRecord["status"],
      entityId: result.entityId ?? null,
      errors: (result.errors ?? []).map((issue) => ({
        rowNumber: issue.rowNumber,
        field: issue.field ?? undefined,
        message: issue.message,
        severity: issue.severity as "error" | "warning",
      })),
      warnings: (result.warnings ?? []).map((issue) => ({
        rowNumber: issue.rowNumber,
        field: issue.field ?? undefined,
        message: issue.message,
        severity: issue.severity as "error" | "warning",
      })),
    })),
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
  fileData: Buffer;
}): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.create({
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    status: "draft",
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    uploadedBy: input.uploadedBy,
    fileData: input.fileData,
  });

  return toImportJobRecord(document.toObject() as ImportJobDocument);
}

export async function findImportJobById(
  workspaceId: string,
  importJobId: string,
): Promise<ImportJobRecord | null> {
  await connectDb();

  if (!mongoose.isValidObjectId(importJobId)) {
    return null;
  }

  const document = await ImportJobModel.findOne(
    withWorkspaceScope(workspaceId, { _id: importJobId }),
  ).lean<ImportJobDocument>();

  return document ? toImportJobRecord(document) : null;
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
    withWorkspaceScope(workspaceId, { _id: importJobId }),
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
    throw new AppError("NOT_FOUND", "Import job not found.");
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
    withWorkspaceScope(workspaceId, { _id: importJobId }),
    {
      $set: {
        status: "mapped",
        mappings: input.mappings,
        defaults: input.defaults,
        ...(input.hasHeaderRow !== undefined ? { hasHeaderRow: input.hasHeaderRow } : {}),
        ...(input.headerRowIndex !== undefined ? { headerRowIndex: input.headerRowIndex } : {}),
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Import job not found.");
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
  },
): Promise<ImportJobRecord> {
  await connectDb();

  const document = await ImportJobModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: importJobId }),
    {
      $set: {
        status: input.status,
        validRows: input.validRows,
        warningRows: input.warningRows,
        errorRows: input.errorRows,
        validationIssues: input.validationIssues,
      },
    },
    { new: true },
  ).lean<ImportJobDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Import job not found.");
  }

  return toImportJobRecord(document);
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
