/** Client-safe document upload constants — keep in sync with server/validation/documents.ts */

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
] as const;

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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

export type DocumentLinkedEntityType = "lead" | "property" | "opportunity" | "campaign";

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
