import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { hasPermission } from "@/server/permissions/permissions";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  archiveDocument,
  createDocument,
  findDocumentById,
  findDocuments,
  type DocumentRecord,
} from "@/server/repositories/documents";
import { findUserById } from "@/server/repositories/users";
import { validateOptionalAssignableMember } from "@/server/services/assignments";
import {
  assertStorageKeyMatchesWorkspace,
  buildDocumentStorageKey,
  sanitizeFileName,
  validateDocumentFileSize,
  validateDocumentMimeType,
} from "@/server/services/document-file-utils";
import {
  getEntityReadPermission,
  validateDocumentLinkedEntity,
} from "@/server/services/document-linked-entities";
import {
  createDocumentUploadToken,
  verifyDocumentUploadToken,
} from "@/server/services/document-upload-token";
import {
  generateDownloadSignedUrl,
  generateUploadSignedUrl,
  getBucketName,
  verifyUploadedObject,
} from "@/server/storage/spaces";
import type {
  DocumentConfirmInput,
  DocumentListQuery,
  DocumentUploadUrlInput,
} from "@/server/validation/documents";

export type DocumentListItem = Omit<DocumentRecord, "bucket" | "storageKey" | "workspaceId"> & {
  uploadedByUser: { id: string; name: string | null; email: string } | null;
};

export type DocumentDetail = DocumentListItem;

function toPublicDocument(document: DocumentRecord): Omit<DocumentRecord, "bucket" | "storageKey" | "workspaceId"> {
  const { bucket: _bucket, storageKey: _storageKey, workspaceId: _workspaceId, ...publicDocument } =
    document;
  return publicDocument;
}

function assertEntityReadAccess(
  permissions: readonly string[],
  linkedEntityType: DocumentRecord["linkedEntityType"],
): void {
  const readPermission = getEntityReadPermission(linkedEntityType);

  if (!hasPermission(permissions, readPermission)) {
    throw new AppError("PERMISSION_DENIED", "You do not have permission to access this entity.");
  }
}

async function enrichDocument(document: DocumentRecord): Promise<DocumentListItem> {
  const uploader = await findUserById(document.uploadedBy);

  return {
    ...toPublicDocument(document),
    uploadedByUser: uploader
      ? { id: uploader.id, name: uploader.name ?? null, email: uploader.email }
      : null,
  };
}

export async function listDocumentsForWorkspace(
  workspaceId: string,
  query: DocumentListQuery,
  permissions: readonly string[],
): Promise<{ documents: DocumentListItem[]; total: number }> {
  await validateDocumentLinkedEntity(
    workspaceId,
    query.linkedEntityType,
    query.linkedEntityId,
  );
  assertEntityReadAccess(permissions, query.linkedEntityType);

  const { documents, total } = await findDocuments(workspaceId, {
    includeArchived: query.includeArchived,
    linkedEntityType: query.linkedEntityType,
    linkedEntityId: query.linkedEntityId,
    mimeTypePrefix: query.mimeTypePrefix,
    page: query.page,
    pageSize: query.pageSize,
  });

  const enriched = await Promise.all(documents.map(enrichDocument));

  return { documents: enriched, total };
}

async function getAuthorizedDocumentRecord(
  workspaceId: string,
  documentId: string,
  permissions: readonly string[],
  options?: { includeArchived?: boolean },
): Promise<DocumentRecord> {
  const document = await findDocumentById(workspaceId, documentId);

  if (!document) {
    throw new AppError("NOT_FOUND", "Document not found.");
  }

  if (
    !options?.includeArchived &&
    (document.status !== "active" || document.archivedAt)
  ) {
    throw new AppError("NOT_FOUND", "Document not found.");
  }

  await validateDocumentLinkedEntity(
    workspaceId,
    document.linkedEntityType,
    document.linkedEntityId,
  );
  assertEntityReadAccess(permissions, document.linkedEntityType);

  return document;
}

export async function getDocumentForWorkspace(
  workspaceId: string,
  documentId: string,
  permissions: readonly string[],
  options?: { includeArchived?: boolean },
): Promise<DocumentDetail> {
  const document = await getAuthorizedDocumentRecord(
    workspaceId,
    documentId,
    permissions,
    options,
  );

  return enrichDocument(document);
}

export async function createDocumentUploadUrlForWorkspace(
  workspaceId: string,
  userId: string,
  permissions: readonly string[],
  input: DocumentUploadUrlInput,
): Promise<{
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}> {
  await validateDocumentLinkedEntity(
    workspaceId,
    input.linkedEntityType,
    input.linkedEntityId,
  );
  assertEntityReadAccess(permissions, input.linkedEntityType);

  validateDocumentMimeType(input.mimeType);
  validateDocumentFileSize(input.fileSize);
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");

  const sanitizedFileName = sanitizeFileName(input.fileName);
  const storageKey = buildDocumentStorageKey({
    workspaceId,
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    fileName: sanitizedFileName,
  });

  const { uploadId, expiresAt } = createDocumentUploadToken({
    workspaceId,
    storageKey,
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    fileName: sanitizedFileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    visibility: input.visibility,
    ownerId: input.ownerId,
    uploadedBy: userId,
  });

  const { url: uploadUrl } = await generateUploadSignedUrl({
    storageKey,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
  });

  return {
    uploadId,
    uploadUrl,
    storageKey,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function confirmDocumentUploadForWorkspace(
  workspaceId: string,
  userId: string,
  permissions: readonly string[],
  input: DocumentConfirmInput,
): Promise<DocumentDetail> {
  const tokenPayload = verifyDocumentUploadToken(input.uploadId);

  if (tokenPayload.workspaceId !== workspaceId) {
    throw new AppError("VALIDATION_ERROR", "Upload token does not match workspace.");
  }

  if (tokenPayload.uploadedBy !== userId) {
    throw new AppError("VALIDATION_ERROR", "Upload token does not match user.");
  }

  if (
    tokenPayload.storageKey !== input.storageKey ||
    tokenPayload.linkedEntityType !== input.linkedEntityType ||
    tokenPayload.linkedEntityId !== input.linkedEntityId ||
    tokenPayload.fileName !== sanitizeFileName(input.fileName) ||
    tokenPayload.mimeType !== input.mimeType ||
    tokenPayload.fileSize !== input.fileSize ||
    tokenPayload.visibility !== input.visibility ||
    (tokenPayload.ownerId ?? null) !== (input.ownerId ?? null)
  ) {
    throw new AppError("VALIDATION_ERROR", "Upload confirmation does not match upload token.");
  }

  assertStorageKeyMatchesWorkspace(workspaceId, input.storageKey);

  await validateDocumentLinkedEntity(
    workspaceId,
    input.linkedEntityType,
    input.linkedEntityId,
  );
  assertEntityReadAccess(permissions, input.linkedEntityType);

  validateDocumentMimeType(input.mimeType);
  validateDocumentFileSize(input.fileSize);
  await validateOptionalAssignableMember(workspaceId, input.ownerId, "Owner");

  const uploaded = await verifyUploadedObject(input.storageKey, input.fileSize);

  if (!uploaded) {
    await createAuditLog({
      workspaceId,
      actorId: userId,
      action: "document.upload_failed",
      entityType: "document",
      entityId: input.storageKey,
      after: { reason: "object_not_found", storageKey: input.storageKey },
    });

    throw new AppError(
      "VALIDATION_ERROR",
      "Uploaded file was not found in storage. Please try uploading again.",
    );
  }

  const document = await createDocument(workspaceId, {
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    ownerId: tokenPayload.ownerId ?? null,
    uploadedBy: userId,
    fileName: sanitizeFileName(input.fileName),
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    bucket: getBucketName(),
    storageKey: input.storageKey,
    visibility: tokenPayload.visibility,
  });

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "document.uploaded",
    entityType: "document",
    entityId: document.id,
    after: {
      fileName: document.fileName,
      linkedEntityType: document.linkedEntityType,
      linkedEntityId: document.linkedEntityId,
    },
  });

  return enrichDocument(document);
}

export async function generateDocumentSignedUrlForWorkspace(
  workspaceId: string,
  userId: string,
  documentId: string,
  permissions: readonly string[],
): Promise<{ url: string; expiresAt: string }> {
  const document = await getAuthorizedDocumentRecord(workspaceId, documentId, permissions);

  if (document.status !== "active" || document.archivedAt) {
    throw new AppError("NOT_FOUND", "Document not found.");
  }

  const { url, expiresAt } = await generateDownloadSignedUrl({
    storageKey: document.storageKey,
    fileName: document.fileName,
  });

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "document.signed_url_generated",
    entityType: "document",
    entityId: document.id,
    after: { expiresAt: expiresAt.toISOString() },
  });

  return { url, expiresAt: expiresAt.toISOString() };
}

export async function archiveDocumentForWorkspace(
  workspaceId: string,
  userId: string,
  documentId: string,
  permissions: readonly string[],
): Promise<DocumentDetail> {
  const existing = await findDocumentById(workspaceId, documentId);

  if (!existing || existing.status !== "active" || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Document not found.");
  }

  await validateDocumentLinkedEntity(
    workspaceId,
    existing.linkedEntityType,
    existing.linkedEntityId,
  );
  assertEntityReadAccess(permissions, existing.linkedEntityType);

  const archived = await archiveDocument(workspaceId, documentId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Document not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "document.archived",
    entityType: "document",
    entityId: archived.id,
    before: { status: "active" },
    after: { status: "archived", archivedAt: archived.archivedAt?.toISOString() },
  });

  return enrichDocument(archived);
}

export async function assertDocumentEntityPermissions(
  permissions: readonly string[],
  requiredDocumentPermission: PermissionKey,
  linkedEntityType: DocumentRecord["linkedEntityType"],
): Promise<void> {
  if (!hasPermission(permissions, requiredDocumentPermission)) {
    throw new AppError("PERMISSION_DENIED", "You do not have permission for this action.");
  }

  assertEntityReadAccess(permissions, linkedEntityType);
}
