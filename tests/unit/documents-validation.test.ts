import { describe, expect, it } from "vitest";

import {
  buildDocumentStorageKey,
  sanitizeFileName,
  validateDocumentFileSize,
  validateDocumentMimeType,
} from "@/server/services/document-file-utils";
import { AppError } from "@/server/errors";
import {
  documentConfirmInputSchema,
  documentListQuerySchema,
  documentUploadUrlInputSchema,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from "@/server/validation/documents";

describe("document validation schemas", () => {
  it("requires linkedEntityType and linkedEntityId in list query", () => {
    const missingEntity = documentListQuerySchema.safeParse({});
    const missingId = documentListQuerySchema.safeParse({ linkedEntityType: "lead" });

    expect(missingEntity.success).toBe(false);
    expect(missingId.success).toBe(false);
  });

  it("accepts valid list query with entity filter", () => {
    const result = documentListQuerySchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
    });

    expect(result.success).toBe(true);
  });

  it("accepts optional image mimeTypePrefix filter", () => {
    const result = documentListQuerySchema.safeParse({
      linkedEntityType: "property",
      linkedEntityId: "507f1f77bcf86cd799439011",
      mimeTypePrefix: "image/",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mimeTypePrefix).toBe("image/");
    }
  });

  it("rejects unsupported mimeTypePrefix values", () => {
    const result = documentListQuerySchema.safeParse({
      linkedEntityType: "property",
      linkedEntityId: "507f1f77bcf86cd799439011",
      mimeTypePrefix: "application/",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid upload-url input", () => {
    const result = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
    });

    expect(result.success).toBe(true);
  });

  it("rejects upload-url input with unknown fields", () => {
    const result = documentUploadUrlInputSchema.safeParse({
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      workspaceId: "507f1f77bcf86cd799439012",
    });

    expect(result.success).toBe(false);
  });

  it("rejects confirm input with client-controlled storage fields", () => {
    const result = documentConfirmInputSchema.safeParse({
      uploadId: "token",
      storageKey: "workspaces/ws/lead/id/uuid/file.pdf",
      linkedEntityType: "lead",
      linkedEntityId: "507f1f77bcf86cd799439011",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      status: "active",
    });

    expect(result.success).toBe(false);
  });
});

describe("document file utils", () => {
  it("sanitizes path segments from filenames", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("folder/contract.pdf")).toBe("contract.pdf");
  });

  it("rejects unsupported mime types", () => {
    expect(() => validateDocumentMimeType("application/x-msdownload")).toThrow(AppError);
  });

  it("rejects empty and oversized files", () => {
    expect(() => validateDocumentFileSize(0)).toThrow(AppError);
    expect(() => validateDocumentFileSize(MAX_DOCUMENT_FILE_SIZE_BYTES + 1)).toThrow(AppError);
  });

  it("builds workspace-scoped storage keys", () => {
    const key = buildDocumentStorageKey({
      workspaceId: "ws-1",
      linkedEntityType: "lead",
      linkedEntityId: "lead-1",
      fileName: "My Contract.pdf",
    });

    expect(key).toMatch(/^workspaces\/ws-1\/lead\/lead-1\/.+\/My Contract\.pdf$/);
  });
});
