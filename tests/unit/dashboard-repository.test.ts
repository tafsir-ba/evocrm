import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/activity", () => ({
  ActivityModel: {
    countDocuments: vi.fn(),
  },
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock("@/models/opportunity", () => ({
  OpportunityModel: {
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock("@/models/property", () => ({
  PropertyModel: {
    aggregate: vi.fn(),
  },
}));

import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import {
  countOpportunitiesByStatusIds,
  groupLeadsBySource,
  groupOpportunitiesByStatus,
  groupPropertiesByStatus,
  sumOpportunityValuesByCurrency,
} from "@/server/repositories/dashboard";
import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

const WORKSPACE_ID = "507f1f77bcf86cd799439012";
const STATUS_ID = "507f1f77bcf86cd799439013";

describe("dashboard repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("casts workspaceId to ObjectId for opportunity status grouping aggregate", async () => {
    vi.mocked(OpportunityModel.aggregate).mockResolvedValue([]);

    await groupOpportunitiesByStatus(WORKSPACE_ID);

    expect(OpportunityModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            workspaceId: new Types.ObjectId(WORKSPACE_ID),
            archivedAt: null,
          },
        }),
      ]),
    );
  });

  it("casts workspaceId and projectId for lead source grouping aggregate", async () => {
    vi.mocked(LeadModel.aggregate).mockResolvedValue([]);
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-07-29T23:59:59.999Z");

    await groupLeadsBySource(WORKSPACE_ID, from, to, TEST_PROJECT_ID);

    expect(LeadModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            workspaceId: new Types.ObjectId(WORKSPACE_ID),
            projectId: new Types.ObjectId(TEST_PROJECT_ID),
            archivedAt: null,
            createdAt: { $gte: from, $lte: to },
          },
        }),
      ]),
    );
  });

  it("casts workspaceId for property status grouping aggregate", async () => {
    vi.mocked(PropertyModel.aggregate).mockResolvedValue([]);

    await groupPropertiesByStatus(WORKSPACE_ID);

    expect(PropertyModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            workspaceId: new Types.ObjectId(WORKSPACE_ID),
            archivedAt: null,
          },
        }),
      ]),
    );
  });

  it("casts workspaceId for opportunity value sum aggregate", async () => {
    vi.mocked(OpportunityModel.aggregate).mockResolvedValue([]);

    await sumOpportunityValuesByCurrency(WORKSPACE_ID, [STATUS_ID]);

    expect(OpportunityModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            workspaceId: new Types.ObjectId(WORKSPACE_ID),
            archivedAt: null,
            statusId: { $in: [new Types.ObjectId(STATUS_ID)] },
            value: { $ne: null },
          },
        }),
      ]),
    );
  });

  it("casts workspaceId for opportunity countDocuments matches", async () => {
    vi.mocked(OpportunityModel.countDocuments).mockResolvedValue(1);

    await countOpportunitiesByStatusIds(WORKSPACE_ID, [STATUS_ID]);

    expect(OpportunityModel.countDocuments).toHaveBeenCalledWith({
      workspaceId: new Types.ObjectId(WORKSPACE_ID),
      archivedAt: null,
      statusId: { $in: [new Types.ObjectId(STATUS_ID)] },
    });
  });
});
