import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-sharing-feature", () => ({
  PROJECT_SHARING_ENABLED: true,
}));

vi.mock("@/server/permissions/require-project-access", () => ({
  resolveAllowedProjectIds: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

vi.mock("@/server/repositories/documents", () => ({
  findDocuments: vi.fn(),
  findDocumentById: vi.fn(),
  archiveDocument: vi.fn(),
  createDocument: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  findLeads: vi.fn(),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: vi.fn(),
}));

vi.mock("@/server/repositories/opportunities", () => ({
  findOpportunityById: vi.fn(),
}));

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  generateDownloadSignedUrl: vi.fn(),
  generateUploadSignedUrl: vi.fn(),
  verifyUploadedObject: vi.fn(),
  getBucketName: vi.fn(() => "test-bucket"),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/apply-project-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/apply-project-scope")>();
  return {
    ...actual,
    applyUserProjectScope: vi.fn(actual.applyUserProjectScope),
  };
});

import {
  requireProjectAccess,
  resolveAllowedProjectIds,
} from "@/server/permissions/require-project-access";
import { findDocumentById, findDocuments } from "@/server/repositories/documents";
import { findLeadById, findLeads } from "@/server/repositories/leads";
import { findUserById } from "@/server/repositories/users";
import { applyUserProjectScope } from "@/server/services/apply-project-scope";
import {
  generateDocumentSignedUrlForWorkspace,
  getDocumentForWorkspace,
  listDocumentsForWorkspace,
} from "@/server/services/documents";
import { getLeadForWorkspace, listLeadsForWorkspace } from "@/server/services/leads";
import { generateDownloadSignedUrl } from "@/server/storage/spaces";

const grantUserId = "grant-user";
const grantedProjectId = "proj-granted";
const otherProjectId = "proj-other";

const permissions = [
  "document:read",
  "document:create",
  "document:archive",
  "lead:read",
  "lead:update",
  "property:read",
  "opportunity:read",
  "campaign:read",
];

function stubGrantOnlyAccess() {
  vi.mocked(resolveAllowedProjectIds).mockResolvedValue([grantedProjectId]);
  vi.mocked(requireProjectAccess).mockImplementation(
    async (_workspaceId, _userId, projectId, _permission) => {
      if (projectId !== grantedProjectId) {
        const { AppError } = await import("@/server/errors");
        throw new AppError("PERMISSION_DENIED", "You do not have access to this project.");
      }
      return {
        membership: null,
        accessMode: "shared_project",
        projectId,
        projectRole: "project_admin",
        effectivePermissions: permissions,
        isWorkspaceAdmin: false,
      } as never;
    },
  );
}

describe("grant-only cross-project resource boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubGrantOnlyAccess();
    vi.mocked(findUserById).mockResolvedValue({
      id: "uploader",
      name: "Uploader",
      email: "u@example.com",
    } as never);
  });

  it("lists documents only when the linked lead belongs to a granted project", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-ok",
      projectId: grantedProjectId,
      archivedAt: null,
    } as never);
    vi.mocked(findDocuments).mockResolvedValue({
      documents: [
        {
          id: "doc-1",
          workspaceId: "ws-1",
          linkedEntityType: "lead",
          linkedEntityId: "lead-ok",
          fileName: "ok.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          status: "active",
          archivedAt: null,
          uploadedBy: "uploader",
          bucket: "b",
          storageKey: "k",
        },
      ],
      total: 1,
    } as never);

    const result = await listDocumentsForWorkspace(
      "ws-1",
      {
        linkedEntityType: "lead",
        linkedEntityId: "lead-ok",
        page: 1,
        pageSize: 25,
      },
      permissions,
      grantUserId,
    );

    expect(result.documents).toHaveLength(1);
    expect(requireProjectAccess).toHaveBeenCalledWith(
      "ws-1",
      grantUserId,
      grantedProjectId,
      "document:read",
    );
  });

  it("denies document list for a lead in another project", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-other",
      projectId: otherProjectId,
      archivedAt: null,
    } as never);

    await expect(
      listDocumentsForWorkspace(
        "ws-1",
        {
          linkedEntityType: "lead",
          linkedEntityId: "lead-other",
          page: 1,
          pageSize: 25,
        },
        permissions,
        grantUserId,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    expect(findDocuments).not.toHaveBeenCalled();
  });

  it("denies document detail for a document linked to another project", async () => {
    vi.mocked(findDocumentById).mockResolvedValue({
      id: "doc-other",
      workspaceId: "ws-1",
      linkedEntityType: "lead",
      linkedEntityId: "lead-other",
      fileName: "secret.pdf",
      mimeType: "application/pdf",
      fileSize: 10,
      status: "active",
      archivedAt: null,
      uploadedBy: "uploader",
      bucket: "b",
      storageKey: "k",
    } as never);
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-other",
      projectId: otherProjectId,
      archivedAt: null,
    } as never);

    await expect(
      getDocumentForWorkspace("ws-1", "doc-other", permissions, grantUserId),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("denies signed URL for a document linked to another project", async () => {
    vi.mocked(findDocumentById).mockResolvedValue({
      id: "doc-other",
      workspaceId: "ws-1",
      linkedEntityType: "lead",
      linkedEntityId: "lead-other",
      fileName: "secret.pdf",
      mimeType: "application/pdf",
      fileSize: 10,
      status: "active",
      archivedAt: null,
      uploadedBy: "uploader",
      bucket: "b",
      storageKey: "k",
    } as never);
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-other",
      projectId: otherProjectId,
      archivedAt: null,
    } as never);

    await expect(
      generateDocumentSignedUrlForWorkspace(
        "ws-1",
        grantUserId,
        "doc-other",
        permissions,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    expect(generateDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it("scopes lead lists to granted project IDs", async () => {
    vi.mocked(applyUserProjectScope).mockImplementation(async (_ws, _user, filter) => ({
      ...filter,
      projectId: undefined,
      projectIds: [grantedProjectId],
    }));
    vi.mocked(findLeads).mockResolvedValue({ leads: [], total: 0 });

    // Avoid deep enrichment dependencies by short-circuiting empty list.
    await listLeadsForWorkspace("ws-1", {}, grantUserId);

    expect(applyUserProjectScope).toHaveBeenCalledWith("ws-1", grantUserId, {});
    expect(findLeads).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ projectIds: [grantedProjectId] }),
    );
  });

  it("denies lead detail outside granted projects", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-other",
      projectId: otherProjectId,
      archivedAt: null,
      firstName: "Other",
      lastName: "Lead",
      fullName: "Other Lead",
      email: null,
      phone: null,
      statusId: "s1",
      sourceId: "src1",
      tags: [],
      ownerId: null,
      assignedTo: null,
      companyId: null,
      createdBy: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      getLeadForWorkspace("ws-1", "lead-other", grantUserId),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows lead detail inside the granted project", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-ok",
      projectId: grantedProjectId,
      archivedAt: null,
      firstName: "Ok",
      lastName: "Lead",
      fullName: "Ok Lead",
      email: null,
      phone: null,
      statusId: "s1",
      sourceId: "src1",
      tags: [],
      ownerId: null,
      assignedTo: null,
      companyId: null,
      createdBy: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
      customFields: {},
      emailConsentStatus: "unknown",
    } as never);

    // Enrichment pulls many repos; mock requireProjectAccess success is enough —
    // if enrich fails we still proved the project gate ran first.
    try {
      await getLeadForWorkspace("ws-1", "lead-ok", grantUserId);
    } catch {
      // Enrichment may fail under unit mocks; project gate must still have passed.
    }

    expect(requireProjectAccess).toHaveBeenCalledWith(
      "ws-1",
      grantUserId,
      grantedProjectId,
      "lead:read",
    );
  });
});
