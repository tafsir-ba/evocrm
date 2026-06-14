import { describe, expect, it } from "vitest";

import {
  sanitizeExportCollection,
  toExportDocumentMetadata,
  toExportIntegrationRecord,
} from "@/server/services/workspace-export-sanitize";

describe("workspace export sanitization", () => {
  it("redacts sensitive integration fields", () => {
    const result = toExportIntegrationRecord({
      id: "int-1",
      workspaceId: "ws-1",
      type: "website",
      name: "Website",
      status: "active",
      apiKeyHash: "hash",
      credentialsEncrypted: "blob",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    expect(result).toEqual({
      id: "int-1",
      workspaceId: "ws-1",
      type: "website",
      name: "Website",
      status: "active",
      hasApiKey: true,
      createdBy: "user-1",
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      archivedAt: null,
    });
  });

  it("returns document metadata without storage key", () => {
    const result = toExportDocumentMetadata({
      id: "doc-1",
      workspaceId: "ws-1",
      linkedEntityType: "lead",
      linkedEntityId: "lead-1",
      filename: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      status: "active",
      uploadedBy: "user-1",
      storageKey: "private/key",
      bucket: "evocrm",
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("bucket");
    expect(result.filename).toBe("contract.pdf");
  });

  it("sanitizes export collections", () => {
    const result = sanitizeExportCollection([
      { id: "1", apiKeyHash: "hash", name: "safe" },
    ]);

    expect(result[0]).toEqual({
      id: "1",
      apiKeyHash: "[redacted]",
      name: "safe",
    });
  });
});
