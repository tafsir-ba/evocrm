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
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label?: string };
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)] mb-3 focus-ring"
        >
          <IconArrowLeft size={14} />
          {back.label ?? "Back"}
        </Link>
      )}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] md:text-[24px] font-bold tracking-tight text-[var(--color-ink)] leading-tight">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="text-[13.5px] text-[var(--color-ink-muted)] mt-1 max-w-2xl">
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
    <div className={cn("px-4 md:px-6 lg:px-8 py-6", className)}>{children}</div>
  );
}
