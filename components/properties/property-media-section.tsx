"use client";

import { useCallback, useEffect, useState } from "react";

import { DocumentActions } from "@/components/documents/document-actions";
import { PropertyMediaDropzone } from "@/components/properties/property-media-dropzone";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentListItem } from "@/lib/documents";
import {
  createPropertyPhotoDraft,
  fetchDocumentSignedUrl,
  fetchPropertyImageDocuments,
  isPropertyPhotoDuplicate,
  MAX_PROPERTY_PHOTO_QUEUE,
  type PropertyPhotoDraft,
  uploadPropertyPhotos,
  validatePropertyPhotoClient,
  buildPropertyPhotoUploadWarning,
} from "@/lib/property-media";
import { formatDocumentFileSize } from "@/lib/documents";

type PropertyMediaSectionProps = {
  workspaceSlug: string;
  propertyId: string;
  canRead: boolean;
  canCreate: boolean;
  canArchive: boolean;
  onPhotosChanged?: () => void;
};

export function PropertyMediaSection({
  workspaceSlug,
  propertyId,
  canRead,
  canCreate,
  canArchive,
  onPhotosChanged,
}: PropertyMediaSectionProps) {
  const [photos, setPhotos] = useState<DocumentListItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}/documents`;

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const documents = await fetchPropertyImageDocuments(workspaceSlug, propertyId);
      setPhotos(documents);

      const urlEntries = await Promise.all(
        documents.map(async (document) => {
          try {
            const url = await fetchDocumentSignedUrl(workspaceSlug, document.id);
            return [document.id, url] as const;
          } catch {
            return [document.id, ""] as const;
          }
        }),
      );

      setPreviewUrls(Object.fromEntries(urlEntries.filter(([, url]) => url)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load photos.");
    } finally {
      setLoading(false);
    }
  }, [canRead, propertyId, workspaceSlug]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  async function handleUploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    if (files.length > MAX_PROPERTY_PHOTO_QUEUE) {
      showToast(`You can upload up to ${MAX_PROPERTY_PHOTO_QUEUE} photos at a time.`);
      return;
    }

    setUploading(true);

    const validFiles: File[] = [];
    for (const file of files) {
      const validationError = validatePropertyPhotoClient(file);
      if (validationError) {
        showToast(validationError);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      setUploading(false);
      return;
    }

    const uploadResults = await uploadPropertyPhotos({
      workspaceSlug,
      propertyId,
      files: validFiles,
    });

    const warning = buildPropertyPhotoUploadWarning(uploadResults);
    if (warning) {
      showToast(warning);
    }

    await loadPhotos();
    onPhotosChanged?.();
    setUploading(false);
  }

  function handleQueueAdd(files: File[]) {
    void handleUploadFiles(files);
  }

  async function handleOpen(documentId: string) {
    setActionPendingId(documentId);

    try {
      const url = await fetchDocumentSignedUrl(workspaceSlug, documentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      window.alert(openError instanceof Error ? openError.message : "Failed to open image.");
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleArchive(documentId: string, fileName: string) {
    if (!window.confirm(`Remove "${fileName}" from property photos?`)) {
      return;
    }

    setActionPendingId(documentId);

    try {
      const response = await fetch(`${apiBase}/${documentId}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json();
        window.alert(body.error?.message ?? "Failed to remove photo.");
        return;
      }

      await loadPhotos();
      onPhotosChanged?.();
    } finally {
      setActionPendingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title="Photos unavailable"
          description="You do not have permission to view property photos."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-5 pb-5 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pb-5">
        <ErrorState
          title="Could not load photos"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadPhotos() }}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 space-y-4">
      {toastMessage && (
        <div
          role="status"
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[12px] text-[var(--color-ink)]"
        >
          {toastMessage}
        </div>
      )}

      {canCreate && (
        <PropertyMediaDropzone
          disabled={uploading}
          photos={[]}
          onAddFiles={handleQueueAdd}
          onRemove={() => undefined}
        />
      )}

      {photos.length === 0 ? (
        <EmptyState
          title={canCreate ? "Upload property photos" : "No photos yet"}
          description={
            canCreate
              ? "Add JPEG, PNG, or WEBP images to build the property gallery."
              : "No property photos have been uploaded yet."
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((photo) => (
            <PropertyMediaGalleryCard
              key={photo.id}
              photo={photo}
              previewUrl={previewUrls[photo.id]}
              canArchive={canArchive}
              pending={actionPendingId === photo.id}
              onOpen={() => void handleOpen(photo.id)}
              onArchive={() => void handleArchive(photo.id, photo.fileName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type PropertyMediaGalleryCardProps = {
  photo: DocumentListItem;
  previewUrl?: string;
  canArchive: boolean;
  pending?: boolean;
  onOpen: () => void;
  onArchive: () => void;
};

function PropertyMediaGalleryCard({
  photo,
  previewUrl,
  canArchive,
  pending,
  onOpen,
  onArchive,
}: PropertyMediaGalleryCardProps) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] overflow-hidden bg-white">
      <button
        type="button"
        className="block w-full aspect-[4/3] bg-[var(--color-muted)]"
        onClick={onOpen}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={photo.fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-ink-muted)]">
            Preview unavailable
          </div>
        )}
      </button>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[var(--color-ink)]">{photo.fileName}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            {formatDocumentFileSize(photo.fileSize)}
          </p>
        </div>
        <DocumentActions
          canArchive={canArchive}
          pending={pending}
          onOpen={onOpen}
          onArchive={onArchive}
        />
      </div>
    </div>
  );
}

type PropertyFormPhotosSectionProps = {
  disabled?: boolean;
  photos: PropertyPhotoDraft[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export function PropertyFormPhotosSection({
  disabled,
  photos,
  onAddFiles,
  onRemove,
}: PropertyFormPhotosSectionProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3200);
  }

  function handleAddFiles(files: File[]) {
    const nextCount = photos.length;
    const accepted: File[] = [];

    for (const file of files) {
      if (nextCount + accepted.length >= MAX_PROPERTY_PHOTO_QUEUE) {
        showToast(`You can queue up to ${MAX_PROPERTY_PHOTO_QUEUE} photos.`);
        break;
      }

      const validationError = validatePropertyPhotoClient(file);
      if (validationError) {
        showToast(validationError);
        continue;
      }

      if (isPropertyPhotoDuplicate(file, photos)) {
        showToast("That photo is already queued.");
        continue;
      }

      accepted.push(file);
    }

    if (accepted.length > 0) {
      onAddFiles(accepted);
    }
  }

  return (
    <div>
      {toastMessage && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[12px] text-[var(--color-ink)]"
        >
          {toastMessage}
        </div>
      )}
      <PropertyMediaDropzone
        disabled={disabled}
        photos={photos}
        onAddFiles={handleAddFiles}
        onRemove={onRemove}
        helperText="Photos upload after you save the property."
      />
    </div>
  );
}

export function addPropertyPhotoDrafts(
  current: PropertyPhotoDraft[],
  files: File[],
): PropertyPhotoDraft[] {
  const next = [...current];

  for (const file of files) {
    if (next.length >= MAX_PROPERTY_PHOTO_QUEUE) {
      break;
    }

    const validationError = validatePropertyPhotoClient(file);
    if (validationError || isPropertyPhotoDuplicate(file, next)) {
      continue;
    }

    next.push(createPropertyPhotoDraft(file));
  }

  return next;
}

export function removePropertyPhotoDraft(
  current: PropertyPhotoDraft[],
  id: string,
): PropertyPhotoDraft[] {
  const target = current.find((item) => item.id === id);
  if (target) {
    URL.revokeObjectURL(target.previewUrl);
  }
  return current.filter((item) => item.id !== id);
}
