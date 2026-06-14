"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconClose } from "@/lib/icons";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = "right",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: "left" | "right";
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
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close drawer"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute top-0 flex h-full w-[min(100%,320px)] flex-col bg-white border-[var(--color-line)] shadow-[var(--shadow-lg)]",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[var(--color-ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
            aria-label="Close"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[var(--color-line)] bg-white px-4 py-3">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}
