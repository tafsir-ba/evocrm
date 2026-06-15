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

vi.mock("@/server/services/documents", () => ({
  listDocumentsForWorkspace: vi.fn(),
  createDocumentUploadUrlForWorkspace: vi.fn(),
  confirmDocumentUploadForWorkspace: vi.fn(),
  getDocumentForWorkspace: vi.fn(),
  generateDocumentSignedUrlForWorkspace: vi.fn(),
  archiveDocumentForWorkspace: vi.fn(),
}));

import { GET as getDocuments } from "@/app/api/workspaces/[workspaceSlug]/documents/route";
import { POST as postUploadUrl } from "@/app/api/workspaces/[workspaceSlug]/documents/upload-url/route";
import { POST as postConfirm } from "@/app/api/workspaces/[workspaceSlug]/documents/confirm/route";
import {
  DELETE as deleteDocument,
  GET as getDocumentById,
} from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/route";
import { POST as postSignedUrl } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/signed-url/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  archiveDocumentForWorkspace,
  confirmDocumentUploadForWorkspace,
  createDocumentUploadUrlForWorkspace,
  generateDocumentSignedUrlForWorkspace,
  getDocumentForWorkspace,
  listDocumentsForWorkspace,
} from "@/server/services/documents";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const sampleDocument = {
  id: "doc-1",
  fileName: "contract.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  status: "active",
};

function mockWorkspaceAccess(permissions: string[]) {
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
      permissions,
    },
  });
}

describe("document API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getDocuments(
      new Request("http://localhost/api/workspaces/demo/documents"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns paginated documents for document:read member", async () => {
    mockWorkspaceAccess(["document:read", "lead:read"]);
    vi.mocked(listDocumentsForWorkspace).mockResolvedValue({
      documents: [sampleDocument as never],
      total: 1,
    });

    const response = await getDocuments(
      new Request(
        "http://localhost/api/workspaces/demo/documents?linkedEntityType=lead&linkedEntityId=507f1f77bcf86cd799439011",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "document:read");
  });

  it("rejects list without required entity filter", async () => {
    mockWorkspaceAccess(["document:read", "lead:read"]);

    const response = await getDocuments(
      new Request("http://localhost/api/workspaces/demo/documents"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(400);
    expect(listDocumentsForWorkspace).not.toHaveBeenCalled();
  });

  it("forwards mimeTypePrefix=image/ to listDocumentsForWorkspace", async () => {
    mockWorkspaceAccess(["document:read", "property:read"]);
    vi.mocked(listDocumentsForWorkspace).mockResolvedValue({
      documents: [sampleDocument as never],
      total: 1,
    });

    const response = await getDocuments(
      new Request(
        "http://localhost/api/workspaces/demo/documents?linkedEntityType=property&linkedEntityId=507f1f77bcf86cd799439011&mimeTypePrefix=image/",
      ),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(listDocumentsForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        linkedEntityType: "property",
        linkedEntityId: "507f1f77bcf86cd799439011",
        mimeTypePrefix: "image/",
      }),
      expect.any(Array),
    );
  });

  it("creates upload URL with document:create permission", async () => {
    mockWorkspaceAccess(["document:create", "lead:read"]);
    vi.mocked(createDocumentUploadUrlForWorkspace).mockResolvedValue({
      uploadId: "token",
      uploadUrl: "https://spaces.example/upload",
      storageKey: "workspaces/ws-1/lead/lead-1/uuid/file.pdf",
      expiresAt: new Date().toISOString(),
    });

    const response = await postUploadUrl(
      new Request("http://localhost/api/workspaces/demo/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedEntityType: "lead",
          linkedEntityId: "507f1f77bcf86cd799439011",
          fileName: "file.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "document:create");
  });

  it("confirms upload with document:create permission", async () => {
    mockWorkspaceAccess(["document:create", "lead:read"]);
    vi.mocked(confirmDocumentUploadForWorkspace).mockResolvedValue(sampleDocument as never);

    const response = await postConfirm(
      new Request("http://localhost/api/workspaces/demo/documents/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: "token",
          storageKey: "workspaces/ws-1/lead/lead-1/uuid/file.pdf",
          linkedEntityType: "lead",
          linkedEntityId: "507f1f77bcf86cd799439011",
          fileName: "file.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
  });

  it("returns document metadata with document:read permission", async () => {
    mockWorkspaceAccess(["document:read", "lead:read"]);
    vi.mocked(getDocumentForWorkspace).mockResolvedValue(sampleDocument as never);

    const response = await getDocumentById(
      new Request("http://localhost/api/workspaces/demo/documents/doc-1"),
      { params: Promise.resolve({ workspaceSlug: "demo", documentId: "doc-1" }) },
    );

    expect(response.status).toBe(200);
  });

  it("returns signed URL with document:read permission", async () => {
    mockWorkspaceAccess(["document:read", "lead:read"]);
    vi.mocked(generateDocumentSignedUrlForWorkspace).mockResolvedValue({
      url: "https://spaces.example/download",
      expiresAt: new Date().toISOString(),
    });

    const response = await postSignedUrl(
      new Request("http://localhost/api/workspaces/demo/documents/doc-1/signed-url", {
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", documentId: "doc-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.url).toContain("https://");
  });

  it("archives document with document:archive permission", async () => {
    mockWorkspaceAccess(["document:archive", "lead:read"]);
    vi.mocked(archiveDocumentForWorkspace).mockResolvedValue({
      ...sampleDocument,
      status: "archived",
      archivedAt: new Date(),
    } as never);

    const response = await deleteDocument(
      new Request("http://localhost/api/workspaces/demo/documents/doc-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", documentId: "doc-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "document:archive");
  });
});
