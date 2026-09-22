import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/server/errors";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_VISIT_SESSION_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES,
  type DocumentLinkedEntityType,
} from "@/server/validation/documents";

const MAX_FILENAME_LENGTH = 200;

export function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const baseName = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const sanitized = baseName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, MAX_FILENAME_LENGTH);

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "file";
  }

  return sanitized;
}

export function allowedMimeTypesForLinkedEntity(
  linkedEntityType?: DocumentLinkedEntityType,
): readonly string[] {
  return linkedEntityType === "visit_session"
    ? ALLOWED_VISIT_SESSION_MIME_TYPES
    : ALLOWED_DOCUMENT_MIME_TYPES;
}

export function validateDocumentMimeType(
  mimeType: string,
  linkedEntityType?: DocumentLinkedEntityType,
): void {
  const allowed = allowedMimeTypesForLinkedEntity(linkedEntityType);

  if (!allowed.includes(mimeType)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported file type.", {
      details: { mimeType, linkedEntityType: linkedEntityType ?? null, allowed },
    });
  }
}

export function validateDocumentFileSize(
  fileSize: number,
  linkedEntityType?: DocumentLinkedEntityType,
): void {
  if (fileSize <= 0) {
    throw new AppError("VALIDATION_ERROR", "File cannot be empty.");
  }

  const maxBytes =
    linkedEntityType === "visit_session"
      ? MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES
      : MAX_DOCUMENT_FILE_SIZE_BYTES;

  if (fileSize > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "File exceeds maximum allowed size.", {
      details: { maxBytes },
    });
  }
}

export function buildDocumentStorageKey(input: {
  workspaceId: string;
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(input.fileName);
  const uniqueId = randomUUID();

  return `workspaces/${input.workspaceId}/${input.linkedEntityType}/${input.linkedEntityId}/${uniqueId}/${safeName}`;
}

export function assertStorageKeyMatchesWorkspace(
  workspaceId: string,
  storageKey: string,
): void {
  const expectedPrefix = `workspaces/${workspaceId}/`;

  if (!storageKey.startsWith(expectedPrefix)) {
    throw new AppError("VALIDATION_ERROR", "Invalid storage key for this workspace.");
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
