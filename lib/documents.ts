/** Client-safe document upload constants — keep in sync with server/validation/documents.ts */

import {
  MAX_VISIT_MEDIA_FILE_SIZE_BYTES,
  VISIT_AUDIO_MIME_TYPES,
  VISIT_VIDEO_MIME_TYPES,
} from "@/lib/visit-notes";

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  ...VISIT_AUDIO_MIME_TYPES,
  ...VISIT_VIDEO_MIME_TYPES,
] as const;

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Prefer this when uploading visit-session media (photos/audio/video). */
export const MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES = MAX_VISIT_MEDIA_FILE_SIZE_BYTES;

export function formatDocumentFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateDocumentFileClient(file: File): string | null {
  if (file.size <= 0) {
    return "File cannot be empty.";
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return `File exceeds maximum size of ${formatDocumentFileSize(MAX_DOCUMENT_FILE_SIZE_BYTES)}.`;
  }

  if (
    !ALLOWED_DOCUMENT_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number],
    )
  ) {
    return "Unsupported file type.";
  }

  return null;
}

export type DocumentLinkedEntityType =
  | "lead"
  | "property"
  | "opportunity"
  | "campaign"
  | "visit_session";

export type DocumentListItem = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  visibility: "private" | "workspace";
  status: "active" | "archived" | "failed";
  createdAt: string;
  uploadedByUser: { id: string; name: string | null; email: string } | null;
};
