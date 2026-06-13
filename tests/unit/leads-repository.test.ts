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
