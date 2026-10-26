import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    find: vi.fn(),
  },
}));
vi.mock("@/models/activity", () => ({ ActivityModel: {} }));
vi.mock("@/models/audit-log", () => ({ AuditLogModel: {} }));
vi.mock("@/models/visit-session", () => ({ VisitSessionModel: {} }));

import { LeadModel } from "@/models/lead";
import { findStaleNewLeadCandidates } from "@/server/repositories/lead-untreated";

const WS = "64b000000000000000000001";
const NEW_STATUS = new mongoose.Types.ObjectId();
const PROJECT = new mongoose.Types.ObjectId();
const CUTOFF = new Date("2026-09-26T12:00:00.000Z");
const CREATED = new Date("2026-08-01T00:00:00.000Z");

function mockLeanDocuments(documents: unknown[]) {
  const lean = vi.fn().mockResolvedValue(documents);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ sort });
  vi.mocked(LeadModel.find).mockReturnValue({ select } as never);
}

function leanLead(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    projectId: PROJECT,
    statusId: NEW_STATUS,
    createdAt: CREATED,
    lastContactedAt: null,
    attributes: {},
    archivedAt: null,
    ...overrides,
  };
}

function query(limit: number) {
  return findStaleNewLeadCandidates({
    workspaceId: WS,
    newStatusId: NEW_STATUS.toString(),
    cutoff: CUTOFF,
    limit,
  });
}

describe("findStaleNewLeadCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits a lean lead with undefined projectId instead of throwing", async () => {
    const valid = leanLead();
    const missingProject = leanLead({ projectId: undefined });
    mockLeanDocuments([missingProject, valid]);

    const page = await query(200);

    expect(page.candidates).toEqual([
      expect.objectContaining({
        id: valid._id.toString(),
        projectId: PROJECT.toString(),
      }),
    ]);
    expect(page.skippedInvalid).toBe(1);
    expect(page.nextAfterId).toBeNull();
  });

  it("omits leads missing _id, statusId, or with a null projectId", async () => {
    mockLeanDocuments([
      leanLead({ projectId: null }),
      leanLead({ statusId: undefined }),
      leanLead({ _id: undefined }),
    ]);

    const page = await query(200);

    expect(page.candidates).toEqual([]);
    expect(page.skippedInvalid).toBe(3);
  });

  it("advances the cursor past an invalid last row on a full page", async () => {
    const valid = leanLead();
    const invalidLast = leanLead({ projectId: undefined });
    mockLeanDocuments([valid, invalidLast]);

    const page = await query(2);

    expect(page.candidates.map((candidate) => candidate.id)).toEqual([
      valid._id.toString(),
    ]);
    expect(page.nextAfterId).toBe(invalidLast._id.toString());
  });

  it("keeps paging when every row on a full page is invalid", async () => {
    const rows = [
      leanLead({ projectId: undefined }),
      leanLead({ projectId: undefined }),
    ];
    mockLeanDocuments(rows);

    const page = await query(2);

    expect(page.candidates).toEqual([]);
    expect(page.nextAfterId).toBe(rows[1]._id.toString());
  });

  it("scopes the query to the workspace and New status", async () => {
    mockLeanDocuments([]);

    await findStaleNewLeadCandidates({
      workspaceId: WS,
      newStatusId: NEW_STATUS.toString(),
      cutoff: CUTOFF,
      afterId: "64b0000000000000000000ff",
      excludedProjectIds: [PROJECT.toString()],
      limit: 10,
    });

    expect(LeadModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        statusId: NEW_STATUS.toString(),
        archivedAt: null,
        _id: { $gt: "64b0000000000000000000ff" },
        projectId: { $nin: [PROJECT.toString()] },
      }),
    );
  });
});
