"use client";

import { useCallback, useEffect, useState } from "react";

import { FileList } from "@/components/documents/file-list";
import { FileUploadZone } from "@/components/documents/file-upload-zone";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentLinkedEntityType, DocumentListItem } from "@/lib/documents";

type DocumentsSectionProps = {
  workspaceSlug: string;
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  canRead: boolean;
  canCreate: boolean;
  canArchive: boolean;
};

export function DocumentsSection({
  workspaceSlug,
  linkedEntityType,
  linkedEntityId,
  canRead,
  canCreate,
  canArchive,
}: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}/documents`;

  const loadDocuments = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        pageSize: "50",
        linkedEntityType,
        linkedEntityId,
      });

      const response = await fetch(`${apiBase}?${params.toString()}`);

      if (response.status === 403) {
        setDocuments([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load documents.");
      }

      const body = (await response.json()) as { data: DocumentListItem[] };
      setDocuments(body.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load documents.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiBase, canRead, linkedEntityId, linkedEntityType]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(file: File) {
    setUploading(true);

    try {
      const uploadUrlResponse = await fetch(`${apiBase}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedEntityType,
          linkedEntityId,
          fileName: file.name,
          mimeType: file.type,
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
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload file to storage.");
      }

      const confirmResponse = await fetch(`${apiBase}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          storageKey,
          linkedEntityType,
          linkedEntityId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          visibility: "private",
        }),
      });

      if (!confirmResponse.ok) {
        const body = await confirmResponse.json();
        throw new Error(body.error?.message ?? "Failed to confirm upload.");
      }

      await loadDocuments();
    } finally {
      setUploading(false);
    }
  }

  async function handleOpen(documentId: string) {
    setActionPendingId(documentId);

    try {
      const response = await fetch(`${apiBase}/${documentId}/signed-url`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json();
        window.alert(body.error?.message ?? "Failed to generate download link.");
        return;
      }

      const body = (await response.json()) as { data: { url: string } };
      window.open(body.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleArchive(documentId: string, fileName: string) {
    if (!window.confirm(`Archive "${fileName}"?`)) {
      return;
    }

    setActionPendingId(documentId);

    try {
      const response = await fetch(`${apiBase}/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json();
        window.alert(body.error?.message ?? "Failed to archive document.");
        return;
      }

      await loadDocuments();
    } finally {
      setActionPendingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title="Documents unavailable"
          description="You do not have permission to view documents."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-5 pb-5 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pb-5">
        <ErrorState
          title="Could not load documents"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadDocuments() }}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 space-y-4">
      {canCreate && (
        <FileUploadZone disabled={!canCreate} uploading={uploading} onUpload={handleUpload} />
      )}

      {documents.length === 0 ? (
        <EmptyState
          title="No files yet"
          description="Upload contracts, IDs, brochures, and other documents related to this record."
        />
      ) : (
        <FileList
          documents={documents}
          canArchive={canArchive}
          actionPendingId={actionPendingId}
          onOpen={handleOpen}
          onArchive={handleArchive}
        />
      )}
    </div>
  );
}
