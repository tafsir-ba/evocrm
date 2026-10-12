import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { WorkflowBackLink } from "@/components/layout/workflow-back-link";
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
  back?: { href: string; label?: string; mode?: "parent" | "stack" };
  closeHref?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: "lg" | "2xl" | "3xl" | "full";
}) {
  const resolvedBack =
    back ?? (closeHref ? { href: closeHref, label: "Back" } : undefined);
  const resolvedCloseHref = closeHref ?? back?.href;
  const maxWidthClass =
    maxWidth === "lg"
      ? "max-w-lg"
      : maxWidth === "3xl"
        ? "max-w-3xl"
        : maxWidth === "full"
          ? "max-w-none w-full"
          : "max-w-2xl";

  return (
    <div className={cn(maxWidthClass, "mx-auto", className)}>
      <div className="relative mb-6">
        <PageHeader
          title={title}
          description={description}
          back={resolvedBack}
        />
        {resolvedCloseHref ? (
          <WorkflowBackLink
            href={resolvedCloseHref}
            mode={back?.mode}
            className="focus-ring absolute top-0 right-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
            ariaLabel="Close"
          >
            <IconClose size={18} />
          </WorkflowBackLink>
        ) : null}
      </div>
      <div className="rounded-xl border border-[var(--color-line)] bg-white p-4 sm:p-6">
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
        <WorkflowBackLink
          href={cancelHref}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
        >
          Cancel
        </WorkflowBackLink>
      ) : (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button
        type="submit"
        form={formId}
        disabled={submitting || submitDisabled}
      >
        {submitting ? `${submitLabel}…` : submitLabel}
      </Button>
    </div>
  );
}
