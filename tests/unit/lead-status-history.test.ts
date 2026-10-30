import { beforeEach, describe, expect, it, vi } from "vitest";

const insertLeadStatusHistory = vi.fn();
const countLeadStatusHistoryForProject = vi.fn();
const countDistinctLeadsEverReachedStatuses = vi.fn();

vi.mock("@/server/repositories/lead-status-history", () => ({
  insertLeadStatusHistory: (...args: unknown[]) =>
    insertLeadStatusHistory(...args),
  countLeadStatusHistoryForProject: (...args: unknown[]) =>
    countLeadStatusHistoryForProject(...args),
  countDistinctLeadsEverReachedStatuses: (...args: unknown[]) =>
    countDistinctLeadsEverReachedStatuses(...args),
  listStatusHistoryLeadIdsMissingSeed: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

import {
  countEverReachedForBuckets,
  projectHasLeadStatusHistory,
  recordLeadStatusChange,
} from "@/server/services/lead-status-history";

describe("lead status history service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a status transition", async () => {
    insertLeadStatusHistory.mockResolvedValue({ id: "h1" });
    await recordLeadStatusChange({
      workspaceId: "w1",
      leadId: "l1",
      projectId: "p1",
      fromStatusId: "s1",
      toStatusId: "s2",
      actorId: "u1",
      source: "manual",
    });
    expect(insertLeadStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        leadId: "l1",
        fromStatusId: "s1",
        toStatusId: "s2",
        source: "manual",
      }),
    );
  });

  it("detects whether a project has history", async () => {
    countLeadStatusHistoryForProject.mockResolvedValueOnce(0);
    expect(await projectHasLeadStatusHistory("w1", "p1")).toBe(false);
    countLeadStatusHistoryForProject.mockResolvedValueOnce(3);
    expect(await projectHasLeadStatusHistory("w1", "p1")).toBe(true);
  });

  it("aggregates ever-reached counts by bucket", async () => {
    countDistinctLeadsEverReachedStatuses
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4);
    const result = await countEverReachedForBuckets({
      workspaceId: "w1",
      projectId: "p1",
      bucketStatusIds: {
        contacted: ["s-c"],
        visit: ["s-v"],
      },
    });
    expect(result).toEqual({ contacted: 8, visit: 4 });
  });
});
