"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconClose } from "@/lib/icons";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
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
          "relative w-full max-w-lg rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)]",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
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
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
