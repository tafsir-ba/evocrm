import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";

vi.mock("@/server/repositories/import-jobs", () => ({
  claimImportJobForExecution: vi.fn(),
  findImportJobById: vi.fn(),
  updateImportJobValidation: vi.fn(),
  releaseImportJobToReady: vi.fn(),
  failImportJob: vi.fn(),
  updateImportJobMapping: vi.fn(),
  updateImportJobProcessingValidation: vi.fn(),
  MUTABLE_IMPORT_JOB_STATUSES: ["draft", "mapped", "ready"],
}));

vi.mock("@/server/imports/import-file-storage", () => ({
  loadImportFileBuffer: vi.fn(),
}));

vi.mock("@/server/imports/import-file-parser", () => ({
  parseImportFile: vi.fn(),
  extractHeadersAndDataRows: vi.fn(),
}));

vi.mock("@/server/imports/import-validator", () => ({
  buildImportContext: vi.fn(),
  validateImportRows: vi.fn(),
  validateMappingConfiguration: vi.fn(),
}));

vi.mock("@/server/imports/import-job-runner", () => ({
  executeImportJob: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  claimImportJobForExecution,
  failImportJob,
  findImportJobById,
  releaseImportJobToReady,
  updateImportJobValidation,
  updateImportJobProcessingValidation,
} from "@/server/repositories/import-jobs";
import { loadImportFileBuffer } from "@/server/imports/import-file-storage";
import {
  extractHeadersAndDataRows,
  parseImportFile,
} from "@/server/imports/import-file-parser";
import { executeImportJob } from "@/server/imports/import-job-runner";
import {
  buildImportContext,
  validateImportRows,
} from "@/server/imports/import-validator";
import {
  executeImportJobForWorkspace,
  validateImportJob,
} from "@/server/services/imports";

const workspaceId = "ws-1";
const importJobId = "import-1";
const actorId = "user-1";

const baseJob = {
  id: importJobId,
  workspaceId,
  entityType: "lead" as const,
  status: "ready" as const,
  fileName: "leads.csv",
  fileSize: 100,
  mimeType: "text/csv",
  uploadedBy: actorId,
  storageKey: "imports/leads.csv",
  storageProvider: "gridfs" as const,
  sheetName: null,
  headerRowIndex: 0,
  hasHeaderRow: true,
  detectedColumns: ["Email"],
  previewRows: [["john@example.com"]],
  mappings: [{ sourceColumnIndex: 0, targetField: "email" }],
  defaults: {},
  totalRows: 1,
  validRows: 0,
  warningRows: 0,
  errorRows: 0,
  validationIssues: [],
  rowOverrides: {},
  createdCount: 0,
  skippedCount: 0,
  failedCount: 0,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validationResult = {
  summary: {
    totalRows: 1,
    validRows: 0,
    warningRows: 0,
    errorRows: 1,
  },
  issues: [
    {
      rowNumber: 1,
      message: "Invalid email",
      severity: "error" as const,
    },
  ],
  normalizedRows: [
    {
      rowNumber: 1,
      rawRow: { email: "bad" },
      status: "error" as const,
      row: {},
      issues: [
        {
          rowNumber: 1,
          message: "Invalid email",
          severity: "error" as const,
        },
      ],
    },
  ],
};

function mockValidationPipeline() {
  vi.mocked(loadImportFileBuffer).mockResolvedValue(Buffer.from("email\nbad"));
  vi.mocked(parseImportFile).mockReturnValue({
    rows: [["email"], ["bad"]],
    sheetName: null,
    rowCount: 2,
  });
  vi.mocked(extractHeadersAndDataRows).mockReturnValue({
    headers: ["email"],
    dataRows: [["bad"]],
  });
  vi.mocked(buildImportContext).mockResolvedValue({
    workspaceId,
    actorId,
    defaultCurrency: "CHF",
    dictionaryLookup: new Map(),
    projectLookup: new Map(),
    memberLookup: new Map(),
    tagLookup: new Map(),
  });
  vi.mocked(validateImportRows).mockResolvedValue(validationResult);
}

describe("import execution lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidationPipeline();
    vi.mocked(findImportJobById).mockResolvedValue(baseJob);
    vi.mocked(updateImportJobValidation).mockImplementation(async () => ({
      ...baseJob,
      status: "ready",
      errorRows: validationResult.summary.errorRows,
    }));
  });

  it("claims the job before persisting validation during execute", async () => {
    const callOrder: string[] = [];

    vi.mocked(claimImportJobForExecution).mockImplementation(async () => {
      callOrder.push("claim");
      return { ...baseJob, status: "processing", startedAt: new Date() };
    });
    vi.mocked(executeImportJob).mockImplementation(async () => {
      callOrder.push("execute");
      return {
        createdCount: 0,
        skippedCount: 1,
        failedCount: 0,
        rowResults: [],
      };
    });
    vi.mocked(findImportJobById).mockResolvedValue({
      ...baseJob,
      status: "completed_with_errors",
    });

    await executeImportJobForWorkspace(
      workspaceId,
      importJobId,
      actorId,
      "CHF",
      { mode: "valid_rows_only" },
    );

    expect(callOrder).toEqual(["claim", "execute"]);
    expect(updateImportJobValidation).not.toHaveBeenCalled();
    expect(claimImportJobForExecution).toHaveBeenCalledBefore(
      vi.mocked(executeImportJob),
    );
    expect(updateImportJobProcessingValidation).toHaveBeenCalledWith(
      importJobId,
      workspaceId,
      expect.objectContaining({
        errorRows: 1,
      }),
    );
  });

  it("returns conflict when the job cannot be claimed", async () => {
    vi.mocked(claimImportJobForExecution).mockResolvedValue(null);

    await expect(
      executeImportJobForWorkspace(
        workspaceId,
        importJobId,
        actorId,
        "CHF",
        { mode: "valid_rows_only" },
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(updateImportJobValidation).not.toHaveBeenCalled();
    expect(executeImportJob).not.toHaveBeenCalled();
  });

  it("releases strict-mode jobs back to ready instead of leaving them processing", async () => {
    vi.mocked(claimImportJobForExecution).mockResolvedValue({
      ...baseJob,
      status: "processing",
      startedAt: new Date(),
    });
    vi.mocked(releaseImportJobToReady).mockResolvedValue({
      ...baseJob,
      status: "ready",
      errorMessage:
        "Import cannot proceed in strict mode while rows have errors.",
    });

    await expect(
      executeImportJobForWorkspace(
        workspaceId,
        importJobId,
        actorId,
        "CHF",
        { mode: "strict" },
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(releaseImportJobToReady).toHaveBeenCalledWith(
      importJobId,
      workspaceId,
      expect.objectContaining({
        errorMessage:
          "Import cannot proceed in strict mode while rows have errors.",
        errorRows: 1,
      }),
    );
    expect(failImportJob).not.toHaveBeenCalled();
    expect(executeImportJob).not.toHaveBeenCalled();
  });

  it("marks processing jobs as failed when execution throws unexpectedly", async () => {
    vi.mocked(claimImportJobForExecution).mockResolvedValue({
      ...baseJob,
      status: "processing",
      startedAt: new Date(),
    });
    vi.mocked(validateImportRows).mockResolvedValue({
      ...validationResult,
      summary: {
        totalRows: 1,
        validRows: 1,
        warningRows: 0,
        errorRows: 0,
      },
    });
    vi.mocked(executeImportJob).mockRejectedValue(
      new AppError("INTERNAL_ERROR", "Database unavailable."),
    );

    await expect(
      executeImportJobForWorkspace(
        workspaceId,
        importJobId,
        actorId,
        "CHF",
        { mode: "valid_rows_only" },
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    expect(failImportJob).toHaveBeenCalledWith(
      importJobId,
      workspaceId,
      "Database unavailable.",
    );
  });

  it("refuses standalone validation for processing jobs", async () => {
    vi.mocked(findImportJobById).mockResolvedValue({
      ...baseJob,
      status: "processing",
    });

    await expect(
      validateImportJob(workspaceId, importJobId, "CHF", actorId),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(updateImportJobValidation).not.toHaveBeenCalled();
  });
});
