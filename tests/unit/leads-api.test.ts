import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadRecordExtras, projectRecordExtras, campaignRecordExtras, enrollmentRecordExtras, activityRecordExtras, opportunityRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  listLeadsForWorkspace: vi.fn(),
  createLeadForWorkspace: vi.fn(),
  archiveLeadForWorkspace: vi.fn(),
  getLeadForWorkspace: vi.fn(),
  updateLeadForWorkspace: vi.fn(),
  purgeLeadsForWorkspace: vi.fn(),
}));

import { GET as getLeads, POST as postLead } from "@/app/api/workspaces/[workspaceSlug]/leads/route";
import { POST as bulkDeleteLeads } from "@/app/api/workspaces/[workspaceSlug]/leads/bulk-delete/route";
import {
  DELETE as deleteLeadById,
  GET as getLeadById,
  PATCH as patchLeadById,
} from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  archiveLeadForWorkspace,
  createLeadForWorkspace,
  getLeadForWorkspace,
  listLeadsForWorkspace,
  purgeLeadsForWorkspace,
  updateLeadForWorkspace,
} from "@/server/services/leads";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleLead = {
  id: "507f1f77bcf86cd799439011",
  workspaceId: "507f1f77bcf86cd799439012",
  fullName: "John Smith",
  status: {
    id: "507f1f77bcf86cd799439013",
    label: "New",
    color: "#3B82F6",
    key: "new",
  },
  source: null,
  tagsResolved: [],
  assignedUser: null,
};

describe("lead API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getLeads(
      new Request("http://localhost/api/workspaces/demo/leads"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns paginated leads for lead:read member", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:read"],
      },
      permissions: ["lead:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(listLeadsForWorkspace).mockResolvedValue({
      leads: [sampleLead as never],
      total: 1,
    });

    const response = await getLeads(
      new Request("http://localhost/api/workspaces/demo/leads"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:read");
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("forwards includeAssociated so list can match secondary memberships", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:read"],
      },
      permissions: ["lead:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(listLeadsForWorkspace).mockResolvedValue({
      leads: [],
      total: 0,
    });

    const response = await getLeads(
      new Request(
        "http://localhost/api/workspaces/demo/leads?projectId=507f1f77bcf86cd799439051&includeAssociated=true",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(listLeadsForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        projectId: "507f1f77bcf86cd799439051",
        includeAssociated: true,
      }),
      "user-1",
    );
  });

  it("creates lead with lead:create permission", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:create"],
      },
      permissions: ["lead:create"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(createLeadForWorkspace).mockResolvedValue({
      lead: sampleLead as never,
      warnings: [],
    });

    const response = await postLead(
      new Request("http://localhost/api/workspaces/demo/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "507f1f77bcf86cd799439011",
          firstName: "John",
          lastName: "Smith",
          statusId: "507f1f77bcf86cd799439013",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:create");
  });

  it("returns PERMISSION_DENIED without lead:read", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getLeads(
      new Request("http://localhost/api/workspaces/demo/leads"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("requires lead:create for POST", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await postLead(
      new Request("http://localhost/api/workspaces/demo/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "507f1f77bcf86cd799439011",
          firstName: "John",
          lastName: "Smith",
          statusId: "507f1f77bcf86cd799439013",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("requires lead:archive for DELETE", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await deleteLeadById(
      new Request("http://localhost/api/workspaces/demo/leads/507f1f77bcf86cd799439011", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", leadId: "507f1f77bcf86cd799439011" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns lead detail for lead:read", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:read"],
      },
      permissions: ["lead:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(getLeadForWorkspace).mockResolvedValue(sampleLead as never);

    const response = await getLeadById(
      new Request("http://localhost/api/workspaces/demo/leads/lead-1"),
      { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lead.id).toBe("507f1f77bcf86cd799439011");
  });

  it("updates lead with lead:update permission", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:update"],
      },
      permissions: ["lead:update"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(updateLeadForWorkspace).mockResolvedValue({
      lead: sampleLead as never,
      warnings: [],
    });

    const response = await patchLeadById(
      new Request("http://localhost/api/workspaces/demo/leads/lead-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Jane" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:update");
  });

  it("archives lead with lead:archive permission", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:archive"],
      },
      permissions: ["lead:archive"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(archiveLeadForWorkspace).mockResolvedValue({
      ...sampleLead,
      archivedAt: new Date(),
    } as never);

    const response = await deleteLeadById(
      new Request("http://localhost/api/workspaces/demo/leads/lead-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:archive");
  });

  it("requires lead:delete for bulk delete", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await bulkDeleteLeads(
      new Request("http://localhost/api/workspaces/demo/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["507f1f77bcf86cd799439011"] }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("permanently deletes leads with lead:delete permission", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "USD",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["lead:delete"],
      },
      permissions: ["lead:delete"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(purgeLeadsForWorkspace).mockResolvedValue({
      deletedCount: 2,
      requestedCount: 2,
    });

    const response = await bulkDeleteLeads(
      new Request("http://localhost/api/workspaces/demo/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectAll: true,
          filters: { search: "hubspot" },
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:delete");
    expect(purgeLeadsForWorkspace).toHaveBeenCalledWith("ws-1", "user-1", {
      selectAll: true,
      filters: { search: "hubspot" },
    });
  });
});
