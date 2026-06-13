import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/activity", () => ({
  ActivityModel: {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { ActivityModel } from "@/models/activity";
import { findActivities, findActivityById } from "@/server/repositories/activities";

describe("activities repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes list queries to workspace and excludes archived by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(ActivityModel.find).mockReturnValue({ sort } as never);
    vi.mocked(ActivityModel.countDocuments).mockResolvedValue(0);

    await findActivities("ws-1");

    expect(ActivityModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
    });
  });

  it("scopes findById to workspace", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    vi.mocked(ActivityModel.findOne).mockReturnValue({ lean } as never);

    await findActivityById("ws-1", "act-1");

    expect(ActivityModel.findOne).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      _id: "act-1",
    });
  });

  it("supports overdue due date filter", async () => {
    const dueBefore = new Date("2026-01-01T00:00:00.000Z");
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(ActivityModel.find).mockReturnValue({ sort } as never);
    vi.mocked(ActivityModel.countDocuments).mockResolvedValue(0);

    await findActivities("ws-1", {
      pendingStatusIds: ["status-pending"],
      requireDueDate: true,
      dueBefore,
    });

    expect(ActivityModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      archivedAt: null,
      statusId: { $in: ["status-pending"] },
      dueDate: {
        $ne: null,
        $lt: dueBefore,
      },
    });
  });

  it("intersects explicit statusId with pending status filters", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    vi.mocked(ActivityModel.find).mockReturnValue({ sort } as never);
    vi.mocked(ActivityModel.countDocuments).mockResolvedValue(0);

    await findActivities("ws-1", {
      statusId: "status-pending",
      pendingStatusIds: ["status-pending", "status-other-pending"],
    });

    expect(ActivityModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        statusId: "status-pending",
      }),
    );
  });

  it("returns empty results when emptyResult is set", async () => {
    const result = await findActivities("ws-1", { emptyResult: true });

    expect(result).toEqual({ activities: [], total: 0 });
    expect(ActivityModel.find).not.toHaveBeenCalled();
  });
});
