import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/property", () => ({
  PropertyModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { PropertyModel } from "@/models/property";
import { findPropertyById, findProperties } from "@/server/repositories/properties";

describe("properties repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes archived properties by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(PropertyModel.find).mockReturnValue({ sort } as never);
    vi.mocked(PropertyModel.countDocuments).mockResolvedValue(0);

    await findProperties("ws-1");

    expect(PropertyModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
    });
  });

  it("includes archived properties when includeArchived is true", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(PropertyModel.find).mockReturnValue({ sort } as never);
    vi.mocked(PropertyModel.countDocuments).mockResolvedValue(0);

    await findProperties("ws-1", { includeArchived: true });

    expect(PropertyModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
  });

  it("scopes lookup by workspaceId and propertyId", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    vi.mocked(PropertyModel.findOne).mockReturnValue({ lean } as never);

    await findPropertyById("ws-1", "property-1");

    expect(PropertyModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: "property-1",
    });
  });
});
