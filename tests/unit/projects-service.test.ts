import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/projects", () => ({
  findProjectByReference: vi.fn(),
  createProject: vi.fn(),
  findProjectById: vi.fn(),
  archiveProject: vi.fn(),
  updateProject: vi.fn(),
  findProjects: vi.fn(),
}));

vi.mock("@/server/repositories/companies", () => ({
  findCompaniesByIds: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemById: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findCompaniesByIds } from "@/server/repositories/companies";
import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
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

const PRIMARY_COMPANY_ID = "507f1f77bcf86cd7994390aa";

function mockKnownCompany() {
  vi.mocked(findCompaniesByIds).mockResolvedValue([
    {
      id: PRIMARY_COMPANY_ID,
      workspaceId: "ws-1",
      name: "Promotor SA",
      nameNormalized: "promotor sa",
      website: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

describe("project service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a standard create without a primary company", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);

    await expect(
      createProjectForWorkspace("ws-1", "user-1", {
        name: "Green View",
        reference: "GV",
        city: "Geneva",
        country: "Switzerland",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("sets workspaceId and createdBy server-side on create", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    mockKnownCompany();
    vi.mocked(createProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: "GV",
      ...projectRecordExtras,
      companies: [{ companyId: PRIMARY_COMPANY_ID, role: "developer", isPrimary: true }],
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
      companies: [{ companyId: PRIMARY_COMPANY_ID, role: "developer", isPrimary: true }],
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
        name: "Green View",
        companies: [{ companyId: PRIMARY_COMPANY_ID, role: "developer", isPrimary: true }],
      }),
    );
    expect(project.createdBy).toBe("user-1");
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Geneva",
        country: "Switzerland",
      }),
    );
  });

  it("allows system callers to create catch-all projects without a company", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(createProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "EvoHome General",
      reference: "EVO-GENERAL",
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
    });

    await createProjectForWorkspace(
      "ws-1",
      "user-1",
      { name: "EvoHome General", reference: "EVO-GENERAL" },
      { allowWithoutPrimaryCompany: true },
    );

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "EvoHome General",
        companies: [],
      }),
    );
  });

  it("normalizes a primary developer association and rejects unknown companies", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(findCompaniesByIds).mockResolvedValue([
      {
        id: "507f1f77bcf86cd7994390aa",
        workspaceId: "ws-1",
        name: "Promotor SA",
        nameNormalized: "promotor sa",
        website: null,
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(createProject).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: null,
      ...projectRecordExtras,
      companies: [
        { companyId: "507f1f77bcf86cd7994390aa", role: "developer", isPrimary: true },
      ],
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

    await createProjectForWorkspace("ws-1", "user-1", {
      name: "Green View",
      commercialStage: "planned",
      companies: [
        { companyId: "507f1f77bcf86cd7994390aa", role: "developer" },
        { companyId: "507f1f77bcf86cd7994390aa", role: "developer", isPrimary: true },
      ],
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialStage: "planned",
        companies: [{ companyId: "507f1f77bcf86cd7994390aa", role: "developer", isPrimary: true }],
      }),
    );

    vi.mocked(findCompaniesByIds).mockResolvedValue([]);
    await expect(
      createProjectForWorkspace("ws-1", "user-1", {
        name: "Green View",
        companies: [{ companyId: "507f1f77bcf86cd7994390ff", role: "developer" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validates property type against the workspace dictionary", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue(null);
    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "507f1f77bcf86cd7994390cc",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "lead_status",
      key: "apartment",
      label: "Apartment",
      color: "#000",
      sortOrder: 0,
      isDefault: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    mockKnownCompany();
    await expect(
      createProjectForWorkspace("ws-1", "user-1", {
        name: "Green View",
        propertyTypeId: "507f1f77bcf86cd7994390cc",
        companies: [{ companyId: PRIMARY_COMPANY_ID, role: "developer", isPrimary: true }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("enforces workspace-scoped reference uniqueness", async () => {
    vi.mocked(findProjectByReference).mockResolvedValue({
      id: "existing",
      workspaceId: "ws-1",
      name: "Existing",
      reference: "GV",
      ...projectRecordExtras,
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
    });
    vi.mocked(updateProject).mockResolvedValue({
      id: "project-1",
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
    });
    vi.mocked(archiveProject).mockResolvedValue({
      id: "project-1",
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

    await expect(
      updateProjectForWorkspace("ws-1", "project-1", "user-1", { name: "Updated" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(updateProject).not.toHaveBeenCalled();
  });
});
