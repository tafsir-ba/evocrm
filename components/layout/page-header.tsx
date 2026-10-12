import type { ReactNode } from "react";
import {
  WorkflowArrival,
  WorkflowBackLink,
} from "@/components/layout/workflow-back-link";
import { IconArrowLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
  density = "comfortable",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label?: string; mode?: "parent" | "stack" };
  meta?: ReactNode;
  density?: "comfortable" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <div className={cn(compact ? "mb-3" : "mb-6", className)}>
      <WorkflowArrival />
      {back && (
        <WorkflowBackLink
          href={back.href}
          label={back.label ?? "Back"}
          mode={back.mode}
          className={cn(
            "focus-ring inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)]",
            compact ? "mb-1.5" : "mb-3",
          )}
        >
          <IconArrowLeft size={14} />
          {back.label ?? "Back"}
        </WorkflowBackLink>
      )}
      <div
        className={cn(
          "flex flex-col md:flex-row md:items-center",
          compact ? "gap-2 md:gap-4" : "gap-3 md:gap-6",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className={cn(
                "leading-tight font-bold tracking-tight text-[var(--color-ink)]",
                compact
                  ? "text-[18px] md:text-[20px]"
                  : "text-[22px] md:text-[24px]",
              )}
            >
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p
              className={cn(
                "max-w-2xl text-[var(--color-ink-muted)]",
                compact ? "mt-0.5 text-[12.5px]" : "mt-1 text-[13.5px]",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-4 md:px-6 lg:px-8", className)}>{children}</div>
  );
}
