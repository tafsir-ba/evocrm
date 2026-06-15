import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/opportunity", () => ({
  OpportunityModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));

import { OpportunityModel } from "@/models/opportunity";
import {
  archiveOpportunity,
  findOpportunities,
  findOpportunityById,
} from "@/server/repositories/opportunities";

describe("opportunities repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes archived opportunities by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(OpportunityModel.find).mockReturnValue({ sort } as never);
    vi.mocked(OpportunityModel.countDocuments).mockResolvedValue(0);

    await findOpportunities("ws-1");

    expect(OpportunityModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
    });
  });

  it("scopes lookup by workspaceId and opportunityId", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    vi.mocked(OpportunityModel.findOne).mockReturnValue({ lean } as never);

    await findOpportunityById("ws-1", "opp-1");

    expect(OpportunityModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: "opp-1",
    });
  });

  it("archives opportunity with archivedAt instead of hard delete", async () => {
    const lean = vi.fn().mockResolvedValue({
      _id: "opp-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      leadId: "lead-1",
      propertyId: "prop-1",
      statusId: "status-1",
      currency: "CHF",
      tags: [],
      createdBy: "user-1",
      archivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(OpportunityModel.findOneAndUpdate).mockReturnValue({ lean } as never);

    await archiveOpportunity("ws-1", "opp-1");

    expect(OpportunityModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        _id: "opp-1",
        archivedAt: null,
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          archivedAt: expect.any(Date),
        }),
      }),
      { new: true },
    );
  });

  it("returns no results when behavior resolves to zero matching statuses", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(OpportunityModel.find).mockReturnValue({ sort } as never);
    vi.mocked(OpportunityModel.countDocuments).mockResolvedValue(0);

    await findOpportunities("ws-1", { statusIds: [] });

    expect(OpportunityModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
      statusId: { $in: [] },
    });
  });
});
