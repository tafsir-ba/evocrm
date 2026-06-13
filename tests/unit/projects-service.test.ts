import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/projects", () => ({
  findProjectByReference: vi.fn(),
  createProject: vi.fn(),
  findProjectById: vi.fn(),
  archiveProject: vi.fn(),
  updateProject: vi.fn(),
  findProjects: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findMembership } from "@/server/repositories/memberships";
import {
  archiveProject,
  createProject,
  findProjectById,
  findProjectByReference,
  updateProject,
} from "@/server/repositories/projects";
import {
  archiveProjectForWorkspace,
  createProjectForWorkspace,
  updateProjectForWorkspace,
} from "@/server/services/projects";

describe("project service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets workspaceId and createdBy server-side on create", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(createProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: "GV",
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
    });

    const project = await createProjectForWorkspace("ws-1", "user-1", {
      name: "Green View",
      reference: "GV",
      city: "Geneva",
      country: "Switzerland",
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
        name: "Green View",
      }),
    );
    expect(project.createdBy).toBe("user-1");
  });

  it("enforces workspace-scoped reference uniqueness", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue({
      id: "existing",
      workspaceId: "ws-1",
      name: "Existing",
      reference: "GV",
      statusId: null,
      address: null,
      city: null,
      country: null,
      description: null,
      createdBy: "user-2",
      ownerId: null,
      assignedTo: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createProjectForWorkspace("ws-1", "user-1", {
        name: "Green View",
        reference: "GV",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("validates assignedTo refers to an active workspace member", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(findMembership).mockResolvedValue(null);

    await expect(
      createProjectForWorkspace("ws-1", "user-1", {
        name: "Green View",
        assignedTo: "user-99",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("clears reference on update when null is provided", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: "GV",
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
    });
    vi.mocked(updateProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
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
    });

    await updateProjectForWorkspace("ws-1", "project-1", "user-1", {
      reference: null,
    });

    expect(updateProject).toHaveBeenCalledWith("ws-1", "project-1", {
      reference: null,
    });
  });

  it("archives projects with archivedAt and does not hard-delete", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
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
    });
    vi.mocked(archiveProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
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

    const project = await archiveProjectForWorkspace("ws-1", "project-1", "user-1");

    expect(archiveProject).toHaveBeenCalledWith("ws-1", "project-1");
    expect(project.archivedAt).toBeInstanceOf(Date);
  });

  it("rejects update when project is archived", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
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

    await expect(
      updateProjectForWorkspace("ws-1", "project-1", "user-1", { name: "Updated" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(updateProject).not.toHaveBeenCalled();
  });
});
