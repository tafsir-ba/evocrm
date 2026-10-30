import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/dictionary-items", () => ({
  listDictionaryItemsForWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  groupProjectLeadsByStatus: vi.fn(),
  groupWorkspaceLeadsByProjectAndStatus: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjects: vi.fn(),
}));

vi.mock("@/server/services/lead-status-history", () => ({
  countEverReachedForBuckets: vi.fn(),
  projectHasLeadStatusTransitions: vi.fn(),
  backfillLeadStatusHistoryForProject: vi.fn(),
  projectHasLeadStatusHistory: vi.fn(),
}));

import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";
import {
  groupProjectLeadsByStatus,
  groupWorkspaceLeadsByProjectAndStatus,
} from "@/server/repositories/leads";
import { findProjects } from "@/server/repositories/projects";
import {
  backfillLeadStatusHistoryForProject,
  countEverReachedForBuckets,
  projectHasLeadStatusTransitions,
} from "@/server/services/lead-status-history";
import {
  getProjectLeadFunnel,
  LEAD_FUNNEL_SCOPE_NOTE,
} from "@/server/services/lead-funnel";

describe("getProjectLeadFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDictionaryItemsForWorkspace).mockResolvedValue(
      [
        {
          id: "s-new",
          key: "new",
          label: "New",
          type: "lead_status",
          color: null,
          order: 1,
          isActive: true,
          isSystem: true,
          workspaceId: "ws-1",
        },
        {
          id: "s-contacted",
          key: "contacted",
          label: "Contacted",
          type: "lead_status",
          color: null,
          order: 2,
          isActive: true,
          isSystem: true,
          workspaceId: "ws-1",
        },
        {
          id: "s-visit",
          key: "visit",
          label: "Visit",
          type: "lead_status",
          color: null,
          order: 3,
          isActive: true,
          isSystem: true,
          workspaceId: "ws-1",
        },
      ] as unknown as Awaited<
        ReturnType<typeof listDictionaryItemsForWorkspace>
      >,
    );
    vi.mocked(groupProjectLeadsByStatus).mockResolvedValue([
      { statusId: "s-contacted", count: 3 },
      { statusId: "s-visit", count: 1 },
    ]);
    vi.mocked(groupWorkspaceLeadsByProjectAndStatus).mockResolvedValue([]);
    vi.mocked(findProjects).mockResolvedValue([
      {
        id: "proj-1",
        name: "Alpha",
        projectType: "development",
      },
    ] as unknown as Awaited<ReturnType<typeof findProjects>>);
  });

  it("does not backfill on read and stays share_of_total without transitions", async () => {
    vi.mocked(projectHasLeadStatusTransitions).mockResolvedValue(false);

    const data = await getProjectLeadFunnel({
      workspaceId: "ws-1",
      projectId: "proj-1",
    });

    expect(backfillLeadStatusHistoryForProject).not.toHaveBeenCalled();
    expect(countEverReachedForBuckets).not.toHaveBeenCalled();
    expect(data.metricMode).toBe("share_of_total");
    expect(data.history.available).toBe(false);
    expect(data.scopeNote).toBe(LEAD_FUNNEL_SCOPE_NOTE);
    expect(data.funnel.conversions).toHaveLength(0);
  });

  it("loads ever-reached and enables conversion when transitions exist", async () => {
    vi.mocked(projectHasLeadStatusTransitions).mockResolvedValue(true);
    vi.mocked(countEverReachedForBuckets).mockResolvedValue({
      new: 10,
      contacted: 8,
      visit: 4,
    });

    const data = await getProjectLeadFunnel({
      workspaceId: "ws-1",
      projectId: "proj-1",
    });

    expect(backfillLeadStatusHistoryForProject).not.toHaveBeenCalled();
    expect(countEverReachedForBuckets).toHaveBeenCalledOnce();
    expect(data.metricMode).toBe("historical_conversion");
    expect(data.history.available).toBe(true);
    expect(
      data.funnel.activeStages.find((s) => s.bucket === "visit")
        ?.conversionFromPrior,
    ).toBeCloseTo(4 / 8);
  });
});
