import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/properties", () => ({
  listPropertiesForWorkspace: vi.fn(),
  createPropertyForWorkspace: vi.fn(),
  archivePropertyForWorkspace: vi.fn(),
  getPropertyForWorkspace: vi.fn(),
  updatePropertyForWorkspace: vi.fn(),
}));

import {
  DELETE as deletePropertyById,
  GET as getPropertyById,
  PATCH as patchPropertyById,
} from "@/app/api/workspaces/[workspaceSlug]/properties/[propertyId]/route";
import {
  GET as getProperties,
  POST as postProperty,
} from "@/app/api/workspaces/[workspaceSlug]/properties/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  archivePropertyForWorkspace,
  createPropertyForWorkspace,
  getPropertyForWorkspace,
  listPropertiesForWorkspace,
  updatePropertyForWorkspace,
} from "@/server/services/properties";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleProperty = {
  id: "507f1f77bcf86cd799439011",
  workspaceId: "507f1f77bcf86cd799439012",
  title: "Green View Apartment 12",
  price: 875000,
  currency: "CHF",
  status: {
    id: "507f1f77bcf86cd799439013",
    label: "Available",
    color: "#3B82F6",
    key: "available",
  },
  type: null,
  project: null,
  tagsResolved: [],
  assignedUser: null,
};

describe("property API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getProperties(
      new Request("http://localhost/api/workspaces/demo/properties"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns paginated properties for property:read member", async () => {
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
        permissions: ["property:read"],
      },
      permissions: ["property:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(listPropertiesForWorkspace).mockResolvedValue({
      properties: [sampleProperty as never],
      total: 1,
    });

    const response = await getProperties(
      new Request("http://localhost/api/workspaces/demo/properties"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "property:read");
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("returns PERMISSION_DENIED without property:read", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getProperties(
      new Request("http://localhost/api/workspaces/demo/properties"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("creates property with property:create permission", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "CHF",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["property:create"],
      },
      permissions: ["property:create"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(createPropertyForWorkspace).mockResolvedValue(sampleProperty as never);

    const response = await postProperty(
      new Request("http://localhost/api/workspaces/demo/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "507f1f77bcf86cd799439011",
          title: "Green View Apartment 12",
          statusId: "507f1f77bcf86cd799439013",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "property:create");
    expect(createPropertyForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        title: "Green View Apartment 12",
      }),
      "CHF",
    );
  });

  it("returns CONFLICT for duplicate reference on create", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "UTC",
        defaultCurrency: "CHF",
      },
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["property:create"],
      },
      permissions: ["property:create"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(createPropertyForWorkspace).mockRejectedValue(
      new AppError("CONFLICT", "A property with this reference already exists in this workspace."),
    );

    const response = await postProperty(
      new Request("http://localhost/api/workspaces/demo/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "507f1f77bcf86cd799439011",
          title: "Green View Apartment 12",
          statusId: "507f1f77bcf86cd799439013",
          reference: "GV-APT-12",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(409);
  });

  it("requires property:create for POST", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await postProperty(
      new Request("http://localhost/api/workspaces/demo/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "507f1f77bcf86cd799439011",
          title: "Green View Apartment 12",
          statusId: "507f1f77bcf86cd799439013",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns property detail for property:read", async () => {
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
        permissions: ["property:read"],
      },
      permissions: ["property:read"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(getPropertyForWorkspace).mockResolvedValue(sampleProperty as never);

    const response = await getPropertyById(
      new Request("http://localhost/api/workspaces/demo/properties/property-1"),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          propertyId: "property-1",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.property.title).toBe("Green View Apartment 12");
  });

  it("updates property with property:update permission", async () => {
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
        permissions: ["property:update"],
      },
      permissions: ["property:update"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(updatePropertyForWorkspace).mockResolvedValue({
      ...sampleProperty,
      title: "Updated Title",
    } as never);

    const response = await patchPropertyById(
      new Request("http://localhost/api/workspaces/demo/properties/property-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          propertyId: "property-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "property:update");
    expect(updatePropertyForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "property-1",
      "user-1",
      expect.objectContaining({ title: "Updated Title" }),
    );
  });

  it("requires property:update for PATCH", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await patchPropertyById(
      new Request("http://localhost/api/workspaces/demo/properties/property-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          propertyId: "property-1",
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("archives property with property:archive permission", async () => {
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
        permissions: ["property:archive"],
      },
      permissions: ["property:archive"],
      accessMode: "member" as const,
      isWorkspaceAdmin: false,
    });
    vi.mocked(archivePropertyForWorkspace).mockResolvedValue({
      ...sampleProperty,
      archivedAt: new Date(),
    } as never);

    const response = await deletePropertyById(
      new Request("http://localhost/api/workspaces/demo/properties/property-1", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          propertyId: "property-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "property:archive");
    expect(archivePropertyForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "property-1",
      "user-1",
    );
  });

  it("requires property:archive for DELETE", async () => {
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
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await deletePropertyById(
      new Request("http://localhost/api/workspaces/demo/properties/property-1", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          workspaceSlug: "demo",
          propertyId: "property-1",
        }),
      },
    );

    expect(response.status).toBe(403);
  });
});
