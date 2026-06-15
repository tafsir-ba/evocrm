import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { IconClose } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function FocusedFormLayout({
  title,
  description,
  back,
  closeHref,
  footer,
  children,
  className,
  maxWidth = "2xl",
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label?: string };
  closeHref?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: "lg" | "2xl" | "3xl";
}) {
  const resolvedBack = back ?? (closeHref ? { href: closeHref, label: "Back" } : undefined);
  const resolvedCloseHref = closeHref ?? back?.href;
  const maxWidthClass =
    maxWidth === "lg"
      ? "max-w-lg"
      : maxWidth === "3xl"
        ? "max-w-3xl"
        : "max-w-2xl";

  return (
    <div className={cn(maxWidthClass, "mx-auto", className)}>
      <div className="relative mb-6">
        <PageHeader title={title} description={description} back={resolvedBack} />
        {resolvedCloseHref ? (
          <Link
            href={resolvedCloseHref}
            className="absolute right-0 top-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-canvas)] focus-ring"
            aria-label="Close"
          >
            <IconClose size={18} />
          </Link>
        ) : null}
      </div>
      <div className="rounded-xl border border-[var(--color-line)] bg-white p-6">
        {children}
        {footer}
      </div>
    </div>
  );
}

export function FocusedFormActions({
  cancelHref,
  onCancel,
  submitLabel,
  submitting = false,
  formId,
  submitDisabled = false,
}: {
  cancelHref?: string;
  onCancel?: () => void;
  submitLabel: string;
  submitting?: boolean;
  formId: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-[var(--color-line)] pt-4">
      {cancelHref ? (
        <Link
          href={cancelHref}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
        >
          Cancel
        </Link>
      ) : (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button type="submit" form={formId} disabled={submitting || submitDisabled}>
        {submitting ? `${submitLabel}…` : submitLabel}
      </Button>
    </div>
  );
}
