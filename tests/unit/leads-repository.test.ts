import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/lead", () => ({
  LeadModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { LeadModel } from "@/models/lead";
import { findLeadById, findLeads } from "@/server/repositories/leads";

describe("leads repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes archived leads by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(LeadModel.find).mockReturnValue({ sort } as never);
    vi.mocked(LeadModel.countDocuments).mockResolvedValue(0);

    await findLeads("ws-1");

    expect(LeadModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
    });
  });

  it("includes archived leads when includeArchived is true", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(LeadModel.find).mockReturnValue({ sort } as never);
    vi.mocked(LeadModel.countDocuments).mockResolvedValue(0);

    await findLeads("ws-1", { includeArchived: true });

    expect(LeadModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
  });

  it("ORs primary projectId with associated membership ids", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(LeadModel.find).mockReturnValue({ sort } as never);
    vi.mocked(LeadModel.countDocuments).mockResolvedValue(0);

    await findLeads("ws-1", {
      projectId: "507f1f77bcf86cd799439051",
      includeAssociated: true,
      associatedLeadIds: ["507f1f77bcf86cd799439011"],
    });

    expect(LeadModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
      $or: [
        { projectId: "507f1f77bcf86cd799439051" },
        { _id: { $in: [expect.anything()] } },
      ],
    });
  });

  it("keeps the primary project filter when associated ids are empty", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(LeadModel.find).mockReturnValue({ sort } as never);
    vi.mocked(LeadModel.countDocuments).mockResolvedValue(0);

    await findLeads("ws-1", {
      projectId: "507f1f77bcf86cd799439051",
      includeAssociated: true,
      associatedLeadIds: [],
    });

    expect(LeadModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
      $or: [{ projectId: "507f1f77bcf86cd799439051" }],
    });
  });

  it("excludes legacy imports when listing genuine inbound", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(LeadModel.find).mockReturnValue({ sort } as never);
    vi.mocked(LeadModel.countDocuments).mockResolvedValue(0);

    await findLeads("ws-1", { acquisition: "genuine_inbound" });

    expect(LeadModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        archivedAt: null,
        $nor: [expect.objectContaining({ $or: expect.any(Array) })],
      }),
    );
  });

  it("scopes lookup by workspaceId and leadId", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    vi.mocked(LeadModel.findOne).mockReturnValue({ lean } as never);

    await findLeadById("ws-1", "lead-1");

    expect(LeadModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: "lead-1",
    });
  });
});
