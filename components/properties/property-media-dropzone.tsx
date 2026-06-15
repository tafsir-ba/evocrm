"use client";

import { useEffect, useRef } from "react";

import {
  formatPropertyPhotoFileSize,
  MAX_PROPERTY_PHOTO_BYTES,
  MAX_PROPERTY_PHOTO_QUEUE,
  type PropertyPhotoDraft,
} from "@/lib/property-media";
import { IconImage, IconTrash, IconUpload } from "@/lib/icons";

type PropertyMediaDropzoneProps = {
  disabled?: boolean;
  photos: PropertyPhotoDraft[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  helperText?: string;
};

export function PropertyMediaDropzone({
  disabled,
  photos,
  onAddFiles,
  onRemove,
  helperText,
}: PropertyMediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (disabled) {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        onAddFiles(files);
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [disabled, onAddFiles]);

  return (
    <div className="space-y-3">
      <div
        data-testid="property-media-dropzone"
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            dragDepthRef.current += 1;
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          if (disabled) {
            return;
          }
          onAddFiles(Array.from(event.dataTransfer.files));
        }}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors cursor-pointer",
          "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-brand-600)]",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--color-brand-600)] shadow-sm">
          <IconUpload size={16} />
        </span>
        <div>
          <p className="text-[13px] font-medium text-[var(--color-ink)]">
            Drop photos, browse, or paste
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            JPEG, PNG, WEBP · up to {MAX_PROPERTY_PHOTO_QUEUE} images · max{" "}
            {formatPropertyPhotoFileSize(MAX_PROPERTY_PHOTO_BYTES)} each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) {
              onAddFiles(files);
            }
          }}
        />
      </div>

      {photos.length > 0 && (
        <ul className="space-y-2">
          {photos.map((photo) => (
            <li
              key={photo.id}
              data-testid="property-media-queue-row"
              className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-white p-2"
            >
              <div className="h-12 w-12 overflow-hidden rounded-md bg-[var(--color-muted)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt={photo.file.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[var(--color-ink)]">
                  {photo.file.name}
                </p>
                <p className="text-[11px] text-[var(--color-ink-muted)]">
                  {formatPropertyPhotoFileSize(photo.file.size)}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] focus-ring"
                aria-label={`Remove ${photo.file.name}`}
                onClick={() => onRemove(photo.id)}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {helperText && (
        <p className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)]">
          <IconImage size={12} />
          {helperText}
        </p>
      )}
    </div>
  );
}
