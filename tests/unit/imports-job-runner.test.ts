import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/import-row-results", () => ({
  findImportRowResults: vi.fn(),
}));

vi.mock("@/server/repositories/import-jobs", () => ({
  updateImportJobExecution: vi.fn(),
}));

import { executeImportJob } from "@/server/imports/import-job-runner";
import { findImportRowResults } from "@/server/repositories/import-row-results";
import { updateImportJobExecution } from "@/server/repositories/import-jobs";

const job = {
  id: "import-1",
  workspaceId: "ws-1",
  entityType: "lead" as const,
  status: "processing" as const,
  fileName: "leads.csv",
  fileSize: 100,
  mimeType: "text/csv",
  uploadedBy: "user-1",
  storageKey: "imports/leads.csv",
  storageProvider: "gridfs" as const,
  sheetName: null,
  headerRowIndex: 0,
  hasHeaderRow: true,
  detectedColumns: [],
  previewRows: [],
  mappings: [],
  defaults: {},
  rowOverrides: {},
  totalRows: 2,
  validRows: 2,
  warningRows: 0,
  errorRows: 0,
  validationIssues: [],
  createdCount: 0,
  skippedCount: 0,
  failedCount: 0,
  startedAt: new Date(),
  completedAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const entityConfig = {
  entityType: "lead" as const,
  label: "Lead",
  requiredPermission: "lead:create",
  fields: [],
  buildCreateInput: vi.fn(async (row) => row),
  createRecord: vi.fn(async () => ({ entityId: "lead-2", warnings: [] })),
};

describe("executeImportJob idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateImportJobExecution).mockResolvedValue(job);
  });

  it("skips rows that were already created during stale reclaim", async () => {
    vi.mocked(findImportRowResults).mockResolvedValue([
      {
        rowNumber: 1,
        status: "created",
        entityId: "lead-1",
        errors: [],
        warnings: [],
      },
    ]);

    const result = await executeImportJob(
      job,
      entityConfig,
      {
        workspaceId: "ws-1",
        actorId: "user-1",
        defaultCurrency: "EUR",
        dictionaryLookup: new Map(),
        projectLookup: new Map(),
        memberLookup: new Map(),
        tagLookup: new Map(),
      },
      {
        summary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
        issues: [],
        normalizedRows: [
          {
            rowNumber: 1,
            rawRow: { firstName: "Existing" },
            row: { firstName: "Existing" },
            status: "valid",
            issues: [],
          },
          {
            rowNumber: 2,
            rawRow: { firstName: "New" },
            row: { firstName: "New" },
            status: "valid",
            issues: [],
          },
        ],
      },
      "valid_rows_only",
    );

    expect(entityConfig.createRecord).toHaveBeenCalledTimes(1);
    expect(result.createdCount).toBe(2);
    expect(result.rowResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowNumber: 1, status: "created", entityId: "lead-1" }),
        expect.objectContaining({ rowNumber: 2, status: "created", entityId: "lead-2" }),
      ]),
    );
  });
});
