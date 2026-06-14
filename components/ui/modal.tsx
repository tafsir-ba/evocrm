"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconClose } from "@/lib/icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "relative flex max-h-[min(calc(100dvh-2rem),100%)] w-full max-w-lg flex-col rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)]",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
          <h2 id="modal-title" className="text-[15px] font-semibold text-[var(--color-ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
            aria-label="Close"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[var(--color-line)] bg-white px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
