"use client";

import { useEffect, useRef } from "react";

import {
  MAX_FEEDBACK_SCREENSHOTS,
  formatFeedbackFileSize,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  type FeedbackScreenshotDraft,
} from "@/lib/feedback";
import { IconImage, IconTrash, IconUpload } from "@/lib/icons";

type FeedbackScreenshotDropzoneProps = {
  disabled?: boolean;
  screenshots: FeedbackScreenshotDraft[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export function FeedbackScreenshotDropzone({
  disabled,
  screenshots,
  onAddFiles,
  onRemove,
}: FeedbackScreenshotDropzoneProps) {
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
        data-testid="feedback-dropzone"
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
            Drop screenshots, browse, or paste
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            PNG, JPEG, WEBP · up to {MAX_FEEDBACK_SCREENSHOTS} images · max{" "}
            {formatFeedbackFileSize(MAX_FEEDBACK_SCREENSHOT_BYTES)} each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
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

      {screenshots.length > 0 && (
        <ul className="space-y-2">
          {screenshots.map((screenshot) => (
            <li
              key={screenshot.id}
              data-testid="feedback-screenshot-row"
              className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-white p-2"
            >
              <div className="h-12 w-12 overflow-hidden rounded-md bg-[var(--color-muted)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshot.previewUrl}
                  alt={screenshot.file.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[var(--color-ink)]">
                  {screenshot.file.name}
                </p>
                <p className="text-[11px] text-[var(--color-ink-muted)]">
                  {formatFeedbackFileSize(screenshot.file.size)}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] focus-ring"
                aria-label={`Remove ${screenshot.file.name}`}
                onClick={() => onRemove(screenshot.id)}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {screenshots.length === 0 && (
        <p className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)]">
          <IconImage size={12} />
          Screenshots are optional when a message is provided.
        </p>
      )}
    </div>
  );
}
