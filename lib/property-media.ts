import { formatDocumentFileSize, MAX_DOCUMENT_FILE_SIZE_BYTES, type DocumentListItem } from "@/lib/documents";

export const PROPERTY_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PropertyPhotoMimeType = (typeof PROPERTY_PHOTO_MIME_TYPES)[number];

export const MAX_PROPERTY_PHOTO_QUEUE = 20;

export const MAX_PROPERTY_PHOTO_BYTES = MAX_DOCUMENT_FILE_SIZE_BYTES;

export const PROPERTY_PHOTO_UPLOAD_WARNING_KEY = "property-photo-upload-warning";

export type PropertyPhotoDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

const PHOTO_EXTENSION_MIME: Record<string, PropertyPhotoMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let pastedImageCounter = 0;

export function formatPropertyPhotoFileSize(bytes: number): string {
  return formatDocumentFileSize(bytes);
}

export function resolvePropertyPhotoMimeType(input: {
  fileName: string;
  mimeType: string;
}): PropertyPhotoMimeType | null {
  if (
    PROPERTY_PHOTO_MIME_TYPES.includes(input.mimeType as PropertyPhotoMimeType)
  ) {
    return input.mimeType as PropertyPhotoMimeType;
  }

  const extension = input.fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension) {
    return null;
  }

  return PHOTO_EXTENSION_MIME[extension] ?? null;
}

export function generatePastedImageFileName(mimeType: PropertyPhotoMimeType): string {
  pastedImageCounter += 1;
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `pasted-image-${timestamp}-${pastedImageCounter}.${extension}`;
}

export function normalizePropertyPhotoFile(file: File): File {
  const resolvedMime = resolvePropertyPhotoMimeType({
    fileName: file.name,
    mimeType: file.type,
  });

  if (!resolvedMime) {
    return file;
  }

  const hasUsefulName = file.name && !file.name.startsWith("image") && file.name.includes(".");
  const fileName = hasUsefulName ? file.name : generatePastedImageFileName(resolvedMime);

  if (fileName === file.name && file.type === resolvedMime) {
    return file;
  }

  return new File([file], fileName, { type: resolvedMime, lastModified: file.lastModified });
}

export function validatePropertyPhotoClient(file: File): string | null {
  if (!resolvePropertyPhotoMimeType({ fileName: file.name, mimeType: file.type })) {
    return "Only JPEG, PNG, and WEBP images are supported.";
  }

  if (file.size <= 0) {
    return "File cannot be empty.";
  }

  if (file.size > MAX_PROPERTY_PHOTO_BYTES) {
    return `Image must be ${formatPropertyPhotoFileSize(MAX_PROPERTY_PHOTO_BYTES)} or smaller.`;
  }

  return null;
}

export function isPropertyPhotoDuplicate(
  file: File,
  existing: PropertyPhotoDraft[],
): boolean {
  return existing.some(
    (item) =>
      item.file.name === file.name &&
      item.file.size === file.size &&
      item.file.lastModified === file.lastModified,
  );
}

export function createPropertyPhotoDraft(file: File): PropertyPhotoDraft {
  const normalized = normalizePropertyPhotoFile(file);
  return {
    id: `${normalized.name}-${normalized.size}-${normalized.lastModified}-${Math.random().toString(36).slice(2)}`,
    file: normalized,
    previewUrl: URL.createObjectURL(normalized),
  };
}

export function isPropertyPhotoDocument(document: DocumentListItem): boolean {
  return (
    document.status === "active" &&
    PROPERTY_PHOTO_MIME_TYPES.includes(document.mimeType as PropertyPhotoMimeType)
  );
}

export function filterPropertyImageDocuments(documents: DocumentListItem[]): DocumentListItem[] {
  return documents.filter(isPropertyPhotoDocument);
}

export function sortPropertyPhotosByCreatedAt(
  documents: DocumentListItem[],
  direction: "asc" | "desc" = "asc",
): DocumentListItem[] {
  return [...documents].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
  });
}

export async function fetchPropertyImageDocuments(
  workspaceSlug: string,
  propertyId: string,
): Promise<DocumentListItem[]> {
  const pageSize = 100;
  const allDocuments: DocumentListItem[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      linkedEntityType: "property",
      linkedEntityId: propertyId,
      mimeTypePrefix: "image/",
    });

    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/documents?${params.toString()}`,
    );

    if (response.status === 403) {
      return [];
    }

    if (!response.ok) {
      throw new Error("Failed to load property photos.");
    }

    const body = (await response.json()) as {
      data: DocumentListItem[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };

    allDocuments.push(...body.data);

    if (page >= body.pagination.totalPages) {
      break;
    }

    page += 1;
  }

  return sortPropertyPhotosByCreatedAt(filterPropertyImageDocuments(allDocuments), "asc");
}

export async function fetchDocumentSignedUrl(
  workspaceSlug: string,
  documentId: string,
): Promise<string> {
  const response = await fetch(
    `/api/workspaces/${workspaceSlug}/documents/${documentId}/signed-url`,
    { method: "POST" },
  );

  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error?.message ?? "Failed to generate image URL.");
  }

  const body = (await response.json()) as { data: { url: string } };
  return body.data.url;
}

export async function uploadPropertyPhoto(input: {
  workspaceSlug: string;
  propertyId: string;
  file: File;
}): Promise<DocumentListItem> {
  const apiBase = `/api/workspaces/${input.workspaceSlug}/documents`;
  const file = normalizePropertyPhotoFile(input.file);
  const mimeType = resolvePropertyPhotoMimeType({
    fileName: file.name,
    mimeType: file.type,
  });

  if (!mimeType) {
    throw new Error("Only JPEG, PNG, and WEBP images are supported.");
  }

  const uploadUrlResponse = await fetch(`${apiBase}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      linkedEntityType: "property",
      linkedEntityId: input.propertyId,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
      visibility: "private",
    }),
  });

  if (!uploadUrlResponse.ok) {
    const body = await uploadUrlResponse.json();
    throw new Error(body.error?.message ?? "Failed to start upload.");
  }

  const uploadUrlBody = (await uploadUrlResponse.json()) as {
    data: {
      upload: {
        uploadId: string;
        uploadUrl: string;
        storageKey: string;
      };
    };
  };

  const { uploadId, uploadUrl, storageKey } = uploadUrlBody.data.upload;

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error("Failed to upload image to storage.");
  }

  const confirmResponse = await fetch(`${apiBase}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      storageKey,
      linkedEntityType: "property",
      linkedEntityId: input.propertyId,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
      visibility: "private",
    }),
  });

  if (!confirmResponse.ok) {
    const body = await confirmResponse.json();
    throw new Error(body.error?.message ?? "Failed to confirm upload.");
  }

  const confirmBody = (await confirmResponse.json()) as {
    data: { document: DocumentListItem };
  };
  return confirmBody.data.document;
}

export type PropertyPhotoUploadResult = {
  fileName: string;
  success: boolean;
  error?: string;
};

export async function uploadPropertyPhotos(input: {
  workspaceSlug: string;
  propertyId: string;
  files: File[];
}): Promise<PropertyPhotoUploadResult[]> {
  const results: PropertyPhotoUploadResult[] = [];

  for (const file of input.files) {
    try {
      await uploadPropertyPhoto({
        workspaceSlug: input.workspaceSlug,
        propertyId: input.propertyId,
        file,
      });
      results.push({ fileName: file.name, success: true });
    } catch (error) {
      results.push({
        fileName: file.name,
        success: false,
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return results;
}

export function buildPropertyPhotoUploadWarning(results: PropertyPhotoUploadResult[]): string | null {
  const failures = results.filter((result) => !result.success);
  if (failures.length === 0) {
    return null;
  }

  if (failures.length === 1) {
    return `Property saved, but "${failures[0].fileName}" could not be uploaded. Retry from the Media tab.`;
  }

  return `Property saved, but ${failures.length} photos could not be uploaded. Retry from the Media tab.`;
}
