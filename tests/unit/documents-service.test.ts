import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/documents", () => ({
  findDocuments: vi.fn(),
  findDocumentById: vi.fn(),
  createDocument: vi.fn(),
  archiveDocument: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
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

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  generateUploadSignedUrl: vi.fn(),
  generateDownloadSignedUrl: vi.fn(),
  verifyUploadedObject: vi.fn(),
  getBucketName: vi.fn(() => "test-bucket"),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/document-upload-token", () => ({
  createDocumentUploadToken: vi.fn(() => ({
    uploadId: "signed-upload-token",
    expiresAt: new Date(Date.now() + 900_000),
  })),
  verifyDocumentUploadToken: vi.fn(() => ({
    uploadId: "signed-upload-token",
    workspaceId: "ws-1",
    storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
    linkedEntityType: "lead",
    linkedEntityId: "lead-1",
    fileName: "contract.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
    visibility: "private",
    uploadedBy: "user-1",
    expiresAt: Date.now() + 900_000,
  })),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  archiveDocument,
  createDocument,
  findDocumentById,
  findDocuments,
} from "@/server/repositories/documents";
import { findLeadById } from "@/server/repositories/leads";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findOpportunityById } from "@/server/repositories/opportunities";
import { findPropertyById } from "@/server/repositories/properties";
import { findUserById } from "@/server/repositories/users";
import {
  archiveDocumentForWorkspace,
  confirmDocumentUploadForWorkspace,
  createDocumentUploadUrlForWorkspace,
  generateDocumentSignedUrlForWorkspace,
  listDocumentsForWorkspace,
} from "@/server/services/documents";
import { verifyDocumentUploadToken } from "@/server/services/document-upload-token";
import {
  generateDownloadSignedUrl,
  generateUploadSignedUrl,
  verifyUploadedObject,
} from "@/server/storage/spaces";
import { AppError } from "@/server/errors";

const allPermissions = [
  "document:read",
  "document:create",
  "document:archive",
  "lead:read",
  "property:read",
  "opportunity:read",
];

const sampleDocument = {
  id: "doc-1",
  workspaceId: "ws-1",
  linkedEntityType: "lead" as const,
  linkedEntityId: "lead-1",
  ownerId: null,
  uploadedBy: "user-1",
  fileName: "contract.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  bucket: "test-bucket",
  storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
  visibility: "private" as const,
  status: "active" as const,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("documents service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      archivedAt: null,
    } as never);
    vi.mocked(findPropertyById).mockResolvedValue({
      id: "property-1",
      archivedAt: null,
    } as never);
    vi.mocked(findOpportunityById).mockResolvedValue({
      id: "opp-1",
      archivedAt: null,
    } as never);
    vi.mocked(generateUploadSignedUrl).mockResolvedValue({
      url: "https://spaces.example/upload",
      expiresAt: new Date(Date.now() + 600_000),
    });
    vi.mocked(generateDownloadSignedUrl).mockResolvedValue({
      url: "https://spaces.example/download",
      expiresAt: new Date(Date.now() + 600_000),
    });
  });

  it("lists documents scoped to workspace entity filter", async () => {
    vi.mocked(findDocuments).mockResolvedValue({ documents: [sampleDocument], total: 1 });

    const result = await listDocumentsForWorkspace(
      "ws-1",
      {
        page: 1,
        pageSize: 25,
        includeArchived: false,
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
      },
      allPermissions,
    );

    expect(result.documents).toHaveLength(1);
    expect(findDocuments).toHaveBeenCalledWith("ws-1", expect.objectContaining({
      linkedEntityType: "lead",
      linkedEntityId: "lead-1",
    }));
  });

  it("rejects campaign linked entity when campaign not found", async () => {
    vi.mocked(findCampaignById).mockResolvedValue(null);

    await expect(
      createDocumentUploadUrlForWorkspace(
        "ws-1",
        "user-1",
        allPermissions,
        {
          linkedEntityType: "campaign",
          linkedEntityId: "507f1f77bcf86cd799439011",
          fileName: "file.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          visibility: "private",
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects upload when linked lead is archived", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      archivedAt: new Date(),
    } as never);

    await expect(
      createDocumentUploadUrlForWorkspace(
        "ws-1",
        "user-1",
        allPermissions,
        {
          linkedEntityType: "lead",
          linkedEntityId: "lead-1",
          fileName: "file.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          visibility: "private",
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects upload without entity read permission", async () => {
    await expect(
      createDocumentUploadUrlForWorkspace(
        "ws-1",
        "user-1",
        ["document:create"],
        {
          linkedEntityType: "lead",
          linkedEntityId: "lead-1",
          fileName: "file.pdf",
          mimeType: "application/pdf",
          fileSize: 100,
          visibility: "private",
        },
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("creates upload URL with server-controlled storage key", async () => {
    const result = await createDocumentUploadUrlForWorkspace(
      "ws-1",
      "user-1",
      allPermissions,
      {
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        visibility: "private",
      },
    );

    expect(result.uploadUrl).toContain("https://");
    expect(result.storageKey).toMatch(/^workspaces\/ws-1\/lead\/lead-1\//);
  });

  it("does not create active document when storage object is missing", async () => {
    vi.mocked(verifyUploadedObject).mockResolvedValue(false);

    await expect(
      confirmDocumentUploadForWorkspace("ws-1", "user-1", allPermissions, {
        uploadId: "signed-upload-token",
        storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        visibility: "private",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createDocument).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.upload_failed" }),
    );
  });

  it("creates active document only after successful storage verification", async () => {
    vi.mocked(verifyUploadedObject).mockResolvedValue(true);
    vi.mocked(createDocument).mockResolvedValue(sampleDocument);

    const result = await confirmDocumentUploadForWorkspace("ws-1", "user-1", allPermissions, {
      uploadId: "signed-upload-token",
      storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
      linkedEntityType: "lead",
      linkedEntityId: "lead-1",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      visibility: "private",
    });

    expect(result.id).toBe("doc-1");
    expect(createDocument).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        uploadedBy: "user-1",
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.uploaded" }),
    );
  });

  it("generates signed URL for active documents only", async () => {
    vi.mocked(findDocumentById).mockResolvedValue(sampleDocument);

    const result = await generateDocumentSignedUrlForWorkspace(
      "ws-1",
      "user-1",
      "doc-1",
      allPermissions,
    );

    expect(result.url).toContain("https://");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.signed_url_generated" }),
    );
  });

  it("rejects signed URL for archived documents", async () => {
    vi.mocked(findDocumentById).mockResolvedValue({
      ...sampleDocument,
      status: "archived",
      archivedAt: new Date(),
    });

    await expect(
      generateDocumentSignedUrlForWorkspace("ws-1", "user-1", "doc-1", allPermissions),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects list for member without linked entity read permission", async () => {
    vi.mocked(findDocuments).mockResolvedValue({ documents: [sampleDocument], total: 1 });

    await expect(
      listDocumentsForWorkspace(
        "ws-1",
        {
          page: 1,
          pageSize: 25,
          includeArchived: false,
          linkedEntityType: "lead",
          linkedEntityId: "lead-1",
        },
        ["document:read"],
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("strips storage metadata from enriched documents", async () => {
    vi.mocked(findDocuments).mockResolvedValue({ documents: [sampleDocument], total: 1 });
    vi.mocked(findUserById).mockResolvedValue({
      id: "user-1",
      name: "Uploader",
      email: "u@example.com",
    } as never);

    const result = await listDocumentsForWorkspace(
      "ws-1",
      {
        page: 1,
        pageSize: 25,
        includeArchived: false,
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
      },
      allPermissions,
    );

    expect(result.documents[0]).not.toHaveProperty("storageKey");
    expect(result.documents[0]).not.toHaveProperty("bucket");
    expect(result.documents[0]).not.toHaveProperty("workspaceId");
  });

  it("rejects confirm when visibility differs from upload token", async () => {
    vi.mocked(verifyDocumentUploadToken).mockReturnValue({
      uploadId: "signed-upload-token",
      workspaceId: "ws-1",
      storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
      linkedEntityType: "lead",
      linkedEntityId: "lead-1",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      visibility: "private",
      uploadedBy: "user-1",
      expiresAt: Date.now() + 900_000,
    });

    await expect(
      confirmDocumentUploadForWorkspace("ws-1", "user-1", allPermissions, {
        uploadId: "signed-upload-token",
        storageKey: "workspaces/ws-1/lead/lead-1/uuid/contract.pdf",
        linkedEntityType: "lead",
        linkedEntityId: "lead-1",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        visibility: "workspace",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createDocument).not.toHaveBeenCalled();
  });

  it("archives document with status and archivedAt", async () => {
    vi.mocked(findDocumentById).mockResolvedValue(sampleDocument);
    vi.mocked(archiveDocument).mockResolvedValue({
      ...sampleDocument,
      status: "archived",
      archivedAt: new Date(),
    });

    const result = await archiveDocumentForWorkspace(
      "ws-1",
      "user-1",
      "doc-1",
      allPermissions,
    );

    expect(result.status).toBe("archived");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.archived" }),
    );
  });
});
