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

vi.mock("@/server/services/opportunities", () => ({
  listOpportunitiesForWorkspace: vi.fn(),
  createOpportunityForWorkspace: vi.fn(),
  getOpportunityForWorkspace: vi.fn(),
  updateOpportunityForWorkspace: vi.fn(),
  archiveOpportunityForWorkspace: vi.fn(),
  moveOpportunityStageForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/pipeline", () => ({
  getPipelineForWorkspace: vi.fn(),
}));

import { GET as getPipeline } from "@/app/api/workspaces/[workspaceSlug]/pipeline/route";
import {
  DELETE as deleteOpportunity,
  GET as getOpportunityById,
  PATCH as patchOpportunity,
} from "@/app/api/workspaces/[workspaceSlug]/opportunities/[opportunityId]/route";
import { PATCH as patchStage } from "@/app/api/workspaces/[workspaceSlug]/opportunities/[opportunityId]/stage/route";
import {
  GET as getOpportunities,
  POST as postOpportunity,
} from "@/app/api/workspaces/[workspaceSlug]/opportunities/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  archiveOpportunityForWorkspace,
  createOpportunityForWorkspace,
  getOpportunityForWorkspace,
  listOpportunitiesForWorkspace,
  moveOpportunityStageForWorkspace,
} from "@/server/services/opportunities";
import { getPipelineForWorkspace } from "@/server/services/pipeline";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleOpportunity = {
  id: "507f1f77bcf86cd799439011",
  workspaceId: "507f1f77bcf86cd799439012",
  leadId: "507f1f77bcf86cd799439013",
  propertyId: "507f1f77bcf86cd799439014",
  statusId: "507f1f77bcf86cd799439015",
  currency: "CHF",
  value: 875000,
  probability: 10,
  status: {
    id: "507f1f77bcf86cd799439015",
    label: "New",
    color: "#3B82F6",
    key: "new",
    behavior: "open",
  },
  lead: { id: "507f1f77bcf86cd799439013", fullName: "John Smith", email: null, phone: null },
  property: {
    id: "507f1f77bcf86cd799439014",
    title: "Lake View",
    reference: "LV-12",
    price: 900000,
    currency: "CHF",
  },
  lostReason: null,
  tagsResolved: [],
  assignedUser: null,
  ownerUser: null,
  tags: [],
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expectedCloseDate: null,
  lostReasonId: null,
  lostReasonText: null,
  closedAt: null,
  wonAt: null,
  lostAt: null,
  notes: null,
  ownerId: null,
  assignedTo: null,
};

function mockWorkspaceAccess(permission: string) {
  vi.mocked(requireAuth).mockResolvedValue({
    user: { id: "user-1", email: "a@b.com" },
  });
  vi.mocked(resolveWorkspace).mockResolvedValue({
    id: "ws-1",
    slug: "demo",
    name: "Demo",
    timezone: "UTC",
    defaultCurrency: "CHF",
  });
  vi.mocked(requirePermission).mockResolvedValue({
    membership: {
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: [permission],
    },
  });
}

describe("opportunity API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getOpportunities(
      new Request("http://localhost/api/workspaces/demo/opportunities"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns paginated opportunities for opportunity:read member", async () => {
    mockWorkspaceAccess("opportunity:read");
    vi.mocked(listOpportunitiesForWorkspace).mockResolvedValue({
      opportunities: [sampleOpportunity as never],
      total: 1,
    });

    const response = await getOpportunities(
      new Request("http://localhost/api/workspaces/demo/opportunities"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("creates opportunity for opportunity:create member", async () => {
    mockWorkspaceAccess("opportunity:create");
    vi.mocked(createOpportunityForWorkspace).mockResolvedValue(sampleOpportunity as never);

    const response = await postOpportunity(
      new Request("http://localhost/api/workspaces/demo/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "507f1f77bcf86cd799439013",
          propertyId: "507f1f77bcf86cd799439014",
          statusId: "507f1f77bcf86cd799439015",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(createOpportunityForWorkspace).toHaveBeenCalled();
  });

  it("returns opportunity detail for opportunity:read member", async () => {
    mockWorkspaceAccess("opportunity:read");
    vi.mocked(getOpportunityForWorkspace).mockResolvedValue(sampleOpportunity as never);

    const response = await getOpportunityById(
      new Request("http://localhost/api/workspaces/demo/opportunities/opp-1"),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          opportunityId: "opp-1",
        }),
      },
    );

    expect(response.status).toBe(200);
  });

  it("archives opportunity for opportunity:archive member", async () => {
    mockWorkspaceAccess("opportunity:archive");
    vi.mocked(archiveOpportunityForWorkspace).mockResolvedValue({
      ...sampleOpportunity,
      archivedAt: new Date(),
    } as never);

    const response = await deleteOpportunity(
      new Request("http://localhost/api/workspaces/demo/opportunities/opp-1"),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          opportunityId: "opp-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(archiveOpportunityForWorkspace).toHaveBeenCalledWith("ws-1", "opp-1", "user-1");
  });

  it("requires lost reason for terminal_lost stage move via stage endpoint", async () => {
    mockWorkspaceAccess("opportunity:update");
    vi.mocked(moveOpportunityStageForWorkspace).mockRejectedValue(
      new AppError("VALIDATION_ERROR", "Lost reason is required when moving to a lost status."),
    );

    const response = await patchStage(
      new Request("http://localhost/api/workspaces/demo/opportunities/opp-1/stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusId: "507f1f77bcf86cd799439099",
        }),
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          opportunityId: "opp-1",
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("returns pipeline data for opportunity:read member", async () => {
    mockWorkspaceAccess("opportunity:read");
    vi.mocked(getPipelineForWorkspace).mockResolvedValue({
      columns: [
        {
          status: {
            id: "status-1",
            label: "New",
            key: "new",
            color: "#3B82F6",
            behavior: "open",
            defaultProbability: 10,
            order: 1,
          },
          count: 1,
          valueTotal: 875000,
          opportunities: [sampleOpportunity as never],
        },
      ],
      totals: { count: 1, activeValue: 875000 },
    });

    const response = await getPipeline(
      new Request("http://localhost/api/workspaces/demo/pipeline"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { columns: unknown[]; totals: { activeValue: number } };
    };
    expect(body.data.columns).toHaveLength(1);
    expect(body.data.totals.activeValue).toBe(875000);
  });

  it("rejects update without opportunity:update permission", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "CHF",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await patchOpportunity(
      new Request("http://localhost/api/workspaces/demo/opportunities/opp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated" }),
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          opportunityId: "opp-1",
        }),
      },
    );

    expect(response.status).toBe(403);
  });
});
