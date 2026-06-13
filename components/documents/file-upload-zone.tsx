"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  formatDocumentFileSize,
  validateDocumentFileClient,
} from "@/lib/documents";
import { IconUpload } from "@/lib/icons";

type FileUploadZoneProps = {
  disabled?: boolean;
  uploading?: boolean;
  onUpload: (file: File) => Promise<void>;
};

export function FileUploadZone({ disabled, uploading, onUpload }: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const validationError = validateDocumentFileClient(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await onUpload(file);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.",
      );
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) {
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);

          if (disabled || uploading) {
            return;
          }

          const file = event.dataTransfer.files[0];

          if (file) {
            void handleFile(file);
          }
        }}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-[var(--color-brand-600)] bg-[color-mix(in_srgb,var(--color-brand-600)_5%,white)]"
            : "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-brand-600)]",
          disabled || uploading ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--color-brand-600)] shadow-sm">
          <IconUpload size={18} />
        </span>
        <div>
          <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
            {uploading ? "Uploading…" : "Drop a file here or click to browse"}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            PDF, images, Office docs, plain text · max{" "}
            {formatDocumentFileSize(MAX_DOCUMENT_FILE_SIZE_BYTES)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || uploading}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_DOCUMENT_MIME_TYPES.join(",")}
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              void handleFile(file);
            }
          }}
        />
      </div>
      {error && (
        <p className="text-[12px] text-[var(--color-danger-fg)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
