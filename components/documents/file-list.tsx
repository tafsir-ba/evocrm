"use client";

import { DocumentActions } from "@/components/documents/document-actions";
import { formatDocumentFileSize, type DocumentListItem } from "@/lib/documents";
import { IconFile } from "@/lib/icons";

type FilePreviewCardProps = {
  document: DocumentListItem;
  canArchive: boolean;
  pending?: boolean;
  onOpen: () => void;
  onArchive: () => void;
};

function formatUploadedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FilePreviewCard({
  document,
  canArchive,
  pending,
  onOpen,
  onArchive,
}: FilePreviewCardProps) {
  const uploaderLabel =
    document.uploadedByUser?.name ??
    document.uploadedByUser?.email ??
    "Unknown user";

  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3 text-[13px] border-b border-[var(--color-line)] last:border-b-0">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-ink-muted)] shrink-0">
        <IconFile size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--color-ink)] truncate">{document.fileName}</p>
        <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 truncate">
          {formatDocumentFileSize(document.fileSize)} · {formatUploadedAt(document.createdAt)} ·{" "}
          {uploaderLabel}
        </p>
      </div>
      <DocumentActions
        canArchive={canArchive}
        pending={pending}
        onOpen={onOpen}
        onArchive={onArchive}
      />
    </div>
  );
}

type FileListProps = {
  documents: DocumentListItem[];
  canArchive: boolean;
  actionPendingId?: string | null;
  onOpen: (documentId: string) => void;
  onArchive: (documentId: string, fileName: string) => void;
};

export function FileList({
  documents,
  canArchive,
  actionPendingId,
  onOpen,
  onArchive,
}: FileListProps) {
  if (documents.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-ink-muted)]">No files attached.</p>
    );
  }

  return (
    <div className="border border-[var(--color-line)] rounded-lg overflow-hidden divide-y divide-[var(--color-line)]">
      {documents.map((document) => (
        <FilePreviewCard
          key={document.id}
          document={document}
          canArchive={canArchive}
          pending={actionPendingId === document.id}
          onOpen={() => onOpen(document.id)}
          onArchive={() => onArchive(document.id, document.fileName)}
        />
      ))}
    </div>
  );
}
