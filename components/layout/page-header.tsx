import Link from "next/link";
import type { ReactNode } from "react";
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
  back?: { href: string; label?: string };
  meta?: ReactNode;
  density?: "comfortable" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <div className={cn(compact ? "mb-3" : "mb-6", className)}>
      {back && (
        <Link
          href={back.href}
          className={cn(
            "inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)] focus-ring",
            compact ? "mb-1.5" : "mb-3",
          )}
        >
          <IconArrowLeft size={14} />
          {back.label ?? "Back"}
        </Link>
      )}
      <div
        className={cn(
          "flex flex-col md:flex-row md:items-center",
          compact ? "gap-2 md:gap-4" : "gap-3 md:gap-6",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1
              className={cn(
                "font-bold tracking-tight text-[var(--color-ink)] leading-tight",
                compact ? "text-[18px] md:text-[20px]" : "text-[22px] md:text-[24px]",
              )}
            >
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p
              className={cn(
                "text-[var(--color-ink-muted)] max-w-2xl",
                compact ? "mt-0.5 text-[12.5px]" : "mt-1 text-[13.5px]",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
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
    <div className={cn("px-4 md:px-6 lg:px-8 py-4", className)}>{children}</div>
  );
}
