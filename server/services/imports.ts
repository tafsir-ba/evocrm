import "server-only";

import mongoose from "mongoose";

import {
  IMPORT_PREVIEW_ROW_LIMIT,
  MAX_IMPORT_FILE_SIZE_BYTES,
  type ImportEntityType,
  type ImportExecuteMode,
  type ImportJobSummary,
} from "@/lib/imports";
import { AppError } from "@/server/errors";
import {
  getImportEntityConfig,
  toImportEntityConfigResponse,
} from "@/server/imports/get-entity-config";
import { executeImportJob } from "@/server/imports/import-job-runner";
import {
  detectDuplicateHeaders,
  extractHeadersAndDataRows,
  parseImportFile,
  validateImportFileMeta,
} from "@/server/imports/import-file-parser";
import { suggestMappingsForHeaders } from "@/server/imports/import-header-matcher";
import { summarizeImportIssues } from "@/server/imports/import-results";
import {
  buildImportContext,
  mapRowFromSource,
  validateImportRows,
  validateMappingConfiguration,
} from "@/server/imports/import-validator";
import {
  loadImportFileBuffer,
  saveImportFileBuffer,
} from "@/server/imports/import-file-storage";
import {
  claimImportJobForExecution,
  createImportJob,
  findImportJobById,
  updateImportJobMapping,
  updateImportJobParseResult,
  updateImportJobValidation,
  type ImportJobRecord,
} from "@/server/repositories/import-jobs";
import type {
  ExecuteImportInput,
  ParseImportInput,
  SaveImportMappingInput,
} from "@/server/validation/imports";
import { createAuditLog } from "@/server/audit/create-audit-log";

function toImportJobSummary(job: ImportJobRecord): ImportJobSummary {
  return {
    id: job.id,
    entityType: job.entityType,
    status: job.status,
    fileName: job.fileName,
    fileSize: job.fileSize,
    mimeType: job.mimeType,
    sheetName: job.sheetName,
    headerRowIndex: job.headerRowIndex,
    rowCount: job.totalRows,
    mappings: job.mappings,
    defaults: job.defaults,
    validationSummary:
      job.status === "ready" ||
      job.status === "processing" ||
      job.status === "completed" ||
      job.status === "completed_with_errors"
        ? {
            totalRows: job.totalRows,
            validRows: job.validRows,
            warningRows: job.warningRows,
            errorRows: job.errorRows,
          }
        : null,
    createdCount: job.createdCount,
    skippedCount: job.skippedCount,
    failedCount: job.failedCount,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function getImportConfigForEntity(entityType: ImportEntityType) {
  const config = getImportEntityConfig(entityType);
  return toImportEntityConfigResponse(config);
}

export async function createImportJobForWorkspace(input: {
  workspaceId: string;
  actorId: string;
  entityType: ImportEntityType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: Buffer;
}) {
  const entityConfig = getImportEntityConfig(input.entityType);

  validateImportFileMeta(
    input.fileName,
    input.mimeType,
    input.fileSize,
    MAX_IMPORT_FILE_SIZE_BYTES,
  );

  const draftJobId = new mongoose.Types.ObjectId();
  const draftJobIdString = draftJobId.toString();

  const { storageKey, storageProvider } = await saveImportFileBuffer({
    workspaceId: input.workspaceId,
    importJobId: draftJobIdString,
    fileName: input.fileName,
    mimeType: input.mimeType,
    buffer: input.fileData,
  });

  const job = await createImportJob({
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    uploadedBy: input.actorId,
    storageKey,
    storageProvider,
    jobId: draftJobIdString,
  });

  const parsed = await parseImportJobFile(job, {
    hasHeaderRow: true,
    headerRowIndex: 0,
    preserveMappings: false,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: `${entityConfig.entityType}.import.started`,
    entityType: "import_job",
    entityId: job.id,
    after: {
      fileName: input.fileName,
      entityType: input.entityType,
      rowCount: parsed.rowCount,
    },
  });

  return parsed;
}

function buildParsePreviewResponse(
  job: ImportJobRecord,
  headers: string[],
  dataRows: string[][],
  mappings: ImportJobRecord["mappings"],
  sheetName: string | null,
  warnings: string[],
) {
  return {
    job: toImportJobSummary(job),
    columns: headers.map((header, index) => ({
      index,
      header,
      sampleValues: dataRows
        .slice(0, 5)
        .map((row) => row[index] ?? "")
        .filter(Boolean),
      suggestedField: mappings[index]?.targetField ?? null,
    })),
    previewRows: dataRows.slice(0, IMPORT_PREVIEW_ROW_LIMIT).map((row, index) => ({
      rowNumber: index + 1,
      values: row,
    })),
    rowCount: dataRows.length,
    warnings,
  };
}

export async function parseImportJobFile(
  job: ImportJobRecord,
  input: ParseImportInput,
) {
  const entityConfig = getImportEntityConfig(job.entityType);
  const fileBuffer = await loadImportJobFileBuffer(job);
  const parsedFile = parseImportFile(fileBuffer, job.fileName);
  const { headers, dataRows } = extractHeadersAndDataRows(
    parsedFile.rows,
    input.hasHeaderRow,
    input.headerRowIndex,
  );

  const duplicateHeaders = detectDuplicateHeaders(headers);
  const suggestions = suggestMappingsForHeaders(headers, entityConfig.fields);
  const mappings = input.preserveMappings
    ? headers.map((_, index) => {
        const existing = job.mappings.find(
          (mapping) => mapping.sourceColumnIndex === index,
        );
        return {
          sourceColumnIndex: index,
          targetField: existing?.targetField ?? suggestions[index] ?? null,
        };
      })
    : headers.map((_, index) => ({
        sourceColumnIndex: index,
        targetField: suggestions[index] ?? null,
      }));

  const updatedJob = await updateImportJobParseResult(job.id, job.workspaceId, {
    status: "mapped",
    sheetName: parsedFile.sheetName,
    headerRowIndex: input.headerRowIndex,
    hasHeaderRow: input.hasHeaderRow,
    detectedColumns: headers,
    previewRows: dataRows.slice(0, IMPORT_PREVIEW_ROW_LIMIT),
    totalRows: dataRows.length,
    mappings,
  });

  return buildParsePreviewResponse(
    updatedJob,
    headers,
    dataRows,
    mappings,
    parsedFile.sheetName,
    duplicateHeaders.length
      ? [`Duplicate headers detected: ${duplicateHeaders.join(", ")}`]
      : [],
  );
}

export async function saveImportJobMapping(
  workspaceId: string,
  importJobId: string,
  input: SaveImportMappingInput,
) {
  const job = await requireImportJob(workspaceId, importJobId);
  const entityConfig = getImportEntityConfig(job.entityType);

  const mappingIssues = validateMappingConfiguration(
    entityConfig,
    input.mappings,
    input.defaults,
  );

  if (mappingIssues.length > 0) {
    throw new AppError("VALIDATION_ERROR", "Import mapping is incomplete.", {
      details: {
        issues: mappingIssues,
      },
    });
  }

  const shouldReparse =
    (input.hasHeaderRow !== undefined && input.hasHeaderRow !== job.hasHeaderRow) ||
    (input.headerRowIndex !== undefined && input.headerRowIndex !== job.headerRowIndex);

  const updatedJob = await updateImportJobMapping(job.id, workspaceId, input);

  if (shouldReparse) {
    return parseImportJobFile(updatedJob, {
      hasHeaderRow: updatedJob.hasHeaderRow,
      headerRowIndex: updatedJob.headerRowIndex,
      preserveMappings: true,
    });
  }

  return {
    job: toImportJobSummary(updatedJob),
    columns: updatedJob.detectedColumns.map((header, index) => ({
      index,
      header,
      sampleValues: updatedJob.previewRows
        .slice(0, 5)
        .map((row) => row[index] ?? "")
        .filter(Boolean),
      suggestedField: updatedJob.mappings[index]?.targetField ?? null,
    })),
    previewRows: updatedJob.previewRows.map((row, index) => ({
      rowNumber: index + 1,
      values: row,
    })),
    rowCount: updatedJob.totalRows,
    warnings: [],
  };
}

export async function validateImportJob(
  workspaceId: string,
  importJobId: string,
  defaultCurrency: string,
  actorId: string,
) {
  const job = await requireImportJob(workspaceId, importJobId);
  const entityConfig = getImportEntityConfig(job.entityType);
  const context = await buildImportContext(
    workspaceId,
    actorId,
    defaultCurrency,
    entityConfig,
  );

  const parsedFile = parseImportFile(
    await loadImportJobFileBuffer(job),
    job.fileName,
  );
  const { headers, dataRows } = extractHeadersAndDataRows(
    parsedFile.rows,
    job.hasHeaderRow,
    job.headerRowIndex,
  );

  const validation = await validateImportRows(
    entityConfig,
    context,
    headers,
    dataRows,
    job.mappings,
    job.defaults,
  );

  const status: ImportJobRecord["status"] = "ready";

  const updatedJob = await updateImportJobValidation(job.id, workspaceId, {
    status,
    validRows: validation.summary.validRows,
    warningRows: validation.summary.warningRows,
    errorRows: validation.summary.errorRows,
    validationIssues: summarizeImportIssues(validation.issues),
  });

  return {
    job: toImportJobSummary(updatedJob),
    summary: validation.summary,
    issues: summarizeImportIssues(validation.issues),
    validation,
    dataRows,
    context,
  };
}

export async function executeImportJobForWorkspace(
  workspaceId: string,
  importJobId: string,
  actorId: string,
  defaultCurrency: string,
  input: ExecuteImportInput,
) {
  const validationResult = await validateImportJob(
    workspaceId,
    importJobId,
    defaultCurrency,
    actorId,
  );

  const claimedJob = await claimImportJobForExecution(importJobId, workspaceId);

  if (!claimedJob) {
    throw new AppError(
      "CONFLICT",
      "This import job has already been executed or is currently processing.",
    );
  }

  const entityConfig = getImportEntityConfig(claimedJob.entityType);

  const result = await executeImportJob(
    claimedJob,
    entityConfig,
    validationResult.context,
    validationResult.validation,
    input.mode as ImportExecuteMode,
  );

  await createAuditLog({
    workspaceId,
    actorId,
    action: `${entityConfig.entityType}.import.completed`,
    entityType: "import_job",
    entityId: claimedJob.id,
    after: {
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
    },
  });

  const updatedJob = await requireImportJob(workspaceId, importJobId);

  return {
    job: toImportJobSummary(updatedJob),
    ...result,
  };
}

export async function getImportJobForWorkspace(
  workspaceId: string,
  importJobId: string,
) {
  const job = await requireImportJob(workspaceId, importJobId);
  return toImportJobSummary(job);
}

export async function getImportJobDetails(
  workspaceId: string,
  importJobId: string,
) {
  const job = await requireImportJob(workspaceId, importJobId, {
    includeRowResults: true,
  });

  return {
    job: toImportJobSummary(job),
    columns: job.detectedColumns.map((header, index) => ({
      index,
      header,
      sampleValues: job.previewRows
        .slice(0, 5)
        .map((row) => row[index] ?? "")
        .filter(Boolean),
      suggestedField: job.mappings[index]?.targetField ?? null,
    })),
    previewRows: job.previewRows.map((row, index) => ({
      rowNumber: index + 1,
      values: row,
    })),
    issues: job.validationIssues,
    rowResults: job.rowResults ?? [],
  };
}

export async function getImportErrorCsv(
  workspaceId: string,
  importJobId: string,
) {
  const job = await requireImportJob(workspaceId, importJobId, {
    includeRowResults: true,
  });
  const parsedFile = parseImportFile(
    await loadImportJobFileBuffer(job),
    job.fileName,
  );
  const { headers, dataRows } = extractHeadersAndDataRows(
    parsedFile.rows,
    job.hasHeaderRow,
    job.headerRowIndex,
  );

  const { buildImportErrorCsv } = await import("@/server/imports/import-results");

  return buildImportErrorCsv(job.rowResults ?? [], headers, dataRows);
}

async function loadImportJobFileBuffer(job: ImportJobRecord): Promise<Buffer> {
  return loadImportFileBuffer({
    storageKey: job.storageKey,
    storageProvider: job.storageProvider,
  });
}

async function requireImportJob(
  workspaceId: string,
  importJobId: string,
  options?: { includeRowResults?: boolean },
): Promise<ImportJobRecord> {
  const job = await findImportJobById(workspaceId, importJobId, options);

  if (!job) {
    throw new AppError("NOT_FOUND", "Import job not found.");
  }

  return job;
}

export { mapRowFromSource };
