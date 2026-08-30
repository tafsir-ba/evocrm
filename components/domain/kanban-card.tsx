import Link from "next/link";
import type { ReactNode } from "react";

export function KanbanCard({
  title,
  subtitle,
  metaLeft,
  metaRight,
  avatar,
  href,
  footer,
}: {
  title: string;
  subtitle?: string;
  metaLeft?: string;
  metaRight?: string;
  avatar?: ReactNode;
  href?: string;
  footer?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold leading-tight text-[var(--color-ink)]">
          {title}
        </p>
        {avatar}
      </div>
      {subtitle ? (
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">{subtitle}</p>
      ) : null}
      {metaLeft || metaRight ? (
        <div className="mt-1 flex items-center justify-between">
          {metaLeft ? (
            <span className="text-[12px] font-semibold tabular text-[var(--color-brand-700)]">
              {metaLeft}
            </span>
          ) : null}
          {metaRight ? (
            <span className="text-[11px] tabular text-[var(--color-ink-faint)]">{metaRight}</span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const className =
    "block rounded-md border border-[var(--color-line)] bg-white p-2 hover:border-[var(--color-brand-300)] hover:shadow-[var(--shadow-sm)] transition-all";

  return (
    <div className="space-y-1">
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
      {footer}
    </div>
  );
}
