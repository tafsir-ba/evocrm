import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/dashboard", () => ({
  getDashboardForWorkspace: vi.fn(),
  getDashboardSummaryForWorkspace: vi.fn(),
  getDashboardPipelineForWorkspace: vi.fn(),
  getDashboardActivitiesForWorkspace: vi.fn(),
  getDashboardSourcesForWorkspace: vi.fn(),
  getDashboardPropertiesForWorkspace: vi.fn(),
}));

import { GET as getDashboard } from "@/app/api/workspaces/[workspaceSlug]/dashboard/route";
import { GET as getDashboardSummary } from "@/app/api/workspaces/[workspaceSlug]/dashboard/summary/route";
import { GET as getDashboardPipeline } from "@/app/api/workspaces/[workspaceSlug]/dashboard/pipeline/route";
import { GET as getDashboardActivities } from "@/app/api/workspaces/[workspaceSlug]/dashboard/activities/route";
import { GET as getDashboardSources } from "@/app/api/workspaces/[workspaceSlug]/dashboard/sources/route";
import { GET as getDashboardProperties } from "@/app/api/workspaces/[workspaceSlug]/dashboard/properties/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  getDashboardActivitiesForWorkspace,
  getDashboardForWorkspace,
  getDashboardPipelineForWorkspace,
  getDashboardPropertiesForWorkspace,
  getDashboardSourcesForWorkspace,
  getDashboardSummaryForWorkspace,
} from "@/server/services/dashboard";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleSummary = {
  dateRange: {
    from: new Date("2026-05-15T00:00:00.000Z"),
    to: new Date("2026-06-14T00:00:00.000Z"),
    timezone: "UTC",
  },
  metrics: {
    newLeads: 0,
    importedLeads: 0,
    activeOpportunities: 0,
    wonOpportunities: 0,
    lostOpportunities: 0,
    activePipelineValue: [],
    wonValue: [],
    activitiesDueToday: 0,
    overdueActivities: 0,
  },
  cmpReconciliation: {
    sourceCohortCount: 0,
    membershipCount: 0,
    overlapCount: 0,
    sourceOnlyCount: 0,
    membershipOnlyCount: 0,
    cmpProjects: [],
  },
};

function mockWorkspaceAccess() {
  vi.mocked(requireAuth).mockResolvedValue({
    user: { id: "user-1", email: "a@b.com" },
  });
  vi.mocked(resolveWorkspace).mockResolvedValue({
    id: "ws-1",
    slug: "demo",
    name: "Demo",
    timezone: "UTC",
    defaultCurrency: "USD",
  });
  vi.mocked(requirePermission).mockResolvedValue({
    membership: {
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: ["dashboard:read"],
    },
  });
}

describe("dashboard API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getDashboardSummary(
      new Request("http://localhost/api/workspaces/demo/dashboard/summary"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns PERMISSION_DENIED without dashboard:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getDashboardSummary(
      new Request("http://localhost/api/workspaces/demo/dashboard/summary"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "dashboard:read");
  });

  it("returns summary for dashboard:read member", async () => {
    mockWorkspaceAccess();
    vi.mocked(getDashboardSummaryForWorkspace).mockResolvedValue(sampleSummary);

    const response = await getDashboardSummary(
      new Request("http://localhost/api/workspaces/demo/dashboard/summary"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(getDashboardSummaryForWorkspace).toHaveBeenCalledWith("ws-1", {});
    const body = await response.json();
    expect(body.data.metrics.newLeads).toBe(0);
  });

  it("rejects partial dateFrom/dateTo query params", async () => {
    mockWorkspaceAccess();

    const response = await getDashboardSummary(
      new Request(
        "http://localhost/api/workspaces/demo/dashboard/summary?dateFrom=2026-06-01",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
    expect(getDashboardSummaryForWorkspace).not.toHaveBeenCalled();
  });

  it("returns summary for periodDays query", async () => {
    mockWorkspaceAccess();
    vi.mocked(getDashboardSummaryForWorkspace).mockResolvedValue(sampleSummary);

    const response = await getDashboardSummary(
      new Request(
        "http://localhost/api/workspaces/demo/dashboard/summary?periodDays=30&timezone=Europe/Zurich",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(getDashboardSummaryForWorkspace).toHaveBeenCalledWith("ws-1", {
      periodDays: 30,
      timezone: "Europe/Zurich",
    });
  });

  it("validates dateFrom/dateTo query params", async () => {
    mockWorkspaceAccess();

    const response = await getDashboardSummary(
      new Request(
        "http://localhost/api/workspaces/demo/dashboard/summary?dateFrom=2026-06-15&dateTo=2026-06-01",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
    expect(getDashboardSummaryForWorkspace).not.toHaveBeenCalled();
  });

  it("returns consolidated dashboard payload", async () => {
    mockWorkspaceAccess();
    vi.mocked(getDashboardForWorkspace).mockResolvedValue({
      summary: sampleSummary,
      pipeline: {
        dateRange: sampleSummary.dateRange,
        stages: [],
        activePipelineValue: [],
        totalCount: 0,
      },
      activities: {
        dateRange: sampleSummary.dateRange,
        dueToday: { count: 0, items: [] },
        overdue: { count: 0, items: [] },
        upcoming: { items: [] },
      },
      sources: {
        dateRange: sampleSummary.dateRange,
        sources: [],
        total: 0,
      },
      properties: { statuses: [], total: 0 },
      recentOpportunities: [],
    });

    const response = await getDashboard(
      new Request("http://localhost/api/workspaces/demo/dashboard"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(getDashboardForWorkspace).toHaveBeenCalledWith("ws-1", {});
  });

  it("exposes pipeline, activities, sources, and properties endpoints", async () => {
    mockWorkspaceAccess();

    vi.mocked(getDashboardPipelineForWorkspace).mockResolvedValue({
      dateRange: sampleSummary.dateRange,
      stages: [],
      activePipelineValue: [],
      totalCount: 0,
    });
    vi.mocked(getDashboardActivitiesForWorkspace).mockResolvedValue({
      dateRange: sampleSummary.dateRange,
      dueToday: { count: 0, items: [] },
      overdue: { count: 0, items: [] },
      upcoming: { items: [] },
    });
    vi.mocked(getDashboardSourcesForWorkspace).mockResolvedValue({
      dateRange: sampleSummary.dateRange,
      sources: [],
      total: 0,
    });
    vi.mocked(getDashboardPropertiesForWorkspace).mockResolvedValue({
      statuses: [],
      total: 0,
    });

    const context = { params: Promise.resolve({ workspaceSlug: "demo" }) };

    expect(
      (await getDashboardPipeline(new Request("http://localhost"), context)).status,
    ).toBe(200);
    expect(
      (await getDashboardActivities(new Request("http://localhost"), context)).status,
    ).toBe(200);
    expect(
      (await getDashboardSources(new Request("http://localhost"), context)).status,
    ).toBe(200);
    expect(
      (await getDashboardProperties(new Request("http://localhost"), context)).status,
    ).toBe(200);
  });
});
