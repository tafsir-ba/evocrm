import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/projects", () => ({
  listProjectsForWorkspace: vi.fn(),
  listProjectsPageForWorkspace: vi.fn(),
  createProjectForWorkspace: vi.fn(),
  archiveProjectForWorkspace: vi.fn(),
  getProjectForWorkspace: vi.fn(),
}));

import { GET as getProjects, POST as postProject } from "@/app/api/workspaces/[workspaceSlug]/projects/route";
import { DELETE as deleteProjectById, GET as getProjectById } from "@/app/api/workspaces/[workspaceSlug]/projects/[projectId]/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  archiveProjectForWorkspace,
  createProjectForWorkspace,
  getProjectForWorkspace,
  listProjectsForWorkspace,
  listProjectsPageForWorkspace,
} from "@/server/services/projects";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("project API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getProjects(
      new Request("http://localhost/api/workspaces/demo/projects"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns projects for project:read member", async () => {
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
        permissions: ["project:read"],
      },
    });
    vi.mocked(listProjectsForWorkspace).mockResolvedValue([
      {
        id: "p1",
        workspaceId: "ws-1",
        name: "Green View",
        reference: "GV",
      ...projectRecordExtras,
        statusId: null,
        address: null,
        city: "Geneva",
        country: "Switzerland",
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await getProjects(
      new Request("http://localhost/api/workspaces/demo/projects"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.projects).toHaveLength(1);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "project:read");
    expect(listProjectsPageForWorkspace).not.toHaveBeenCalled();
  });

  it("returns a paginated project browser page", async () => {
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
        permissions: ["project:read"],
      },
    });
    vi.mocked(listProjectsPageForWorkspace).mockResolvedValue({
      projects: [
        {
          id: "p1",
          workspaceId: "ws-1",
          name: "Green View",
          reference: "GV",
          ...projectRecordExtras,
          statusId: null,
          address: null,
          city: "Geneva",
          country: "Switzerland",
          description: null,
          createdBy: "user-1",
          ownerId: null,
          assignedTo: null,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 26,
    });

    const response = await getProjects(
      new Request(
        "http://localhost/api/workspaces/demo/projects?page=1&pageSize=25&view=all&sort=inbound&withCounts=true",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    });
    expect(listProjectsPageForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        view: "all",
        sort: "inbound",
        withCounts: true,
      }),
    );
    expect(listProjectsForWorkspace).not.toHaveBeenCalled();
  });

  it("returns PERMISSION_DENIED without project:read", async () => {
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

    const response = await getProjects(
      new Request("http://localhost/api/workspaces/demo/projects"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("requires project:create for POST", async () => {
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

    const response = await postProject(
      new Request("http://localhost/api/workspaces/demo/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Green View" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "project:create");
  });

  it("validates POST input", async () => {
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
        permissions: ["project:create"],
      },
    });

    const response = await postProject(
      new Request("http://localhost/api/workspaces/demo/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
    expect(createProjectForWorkspace).not.toHaveBeenCalled();
  });

  it("archives project via DELETE", async () => {
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
        permissions: ["project:archive"],
      },
    });
    vi.mocked(archiveProjectForWorkspace).mockResolvedValue({
      id: "p1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
      ...projectRecordExtras,
      statusId: null,
      address: null,
      city: null,
      country: null,
      description: null,
      createdBy: "user-1",
      ownerId: null,
      assignedTo: null,
      archivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await deleteProjectById(
      new Request("http://localhost/api/workspaces/demo/projects/p1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", projectId: "p1" }) },
    );

    expect(response.status).toBe(200);
    expect(archiveProjectForWorkspace).toHaveBeenCalledWith("ws-1", "p1", "user-1");
  });

  it("returns a single project for project:read member", async () => {
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
        permissions: ["project:read"],
      },
    });
    vi.mocked(getProjectForWorkspace).mockResolvedValue({
      id: "p1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
      ...projectRecordExtras,
      statusId: null,
      address: null,
      city: null,
      country: null,
      description: null,
      createdBy: "user-1",
      ownerId: null,
      assignedTo: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      companyPeople: [],
      associablePeople: [],
    });

    const response = await getProjectById(
      new Request("http://localhost/api/workspaces/demo/projects/p1"),
      { params: Promise.resolve({ workspaceSlug: "demo", projectId: "p1" }) },
    );

    expect(response.status).toBe(200);
    expect(getProjectForWorkspace).toHaveBeenCalledWith("ws-1", "p1");
  });
});
