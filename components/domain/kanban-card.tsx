import Link from "next/link";
import type { ReactNode } from "react";

export function KanbanCard({
  title,
  subtitle,
  metaLeft,
  metaRight,
  avatar,
  href,
}: {
  title: string;
  subtitle?: string;
  metaLeft?: string;
  metaRight?: string;
  avatar?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-[var(--color-ink)] leading-tight">
          {title}
        </p>
        {avatar}
      </div>
      {subtitle && (
        <p className="text-[12px] text-[var(--color-ink-muted)] mt-1 truncate">
          {subtitle}
        </p>
      )}
      {(metaLeft || metaRight) && (
        <div className="mt-2 flex items-center justify-between">
          {metaLeft && (
            <span className="text-[12.5px] font-semibold text-[var(--color-brand-700)] tabular">
              {metaLeft}
            </span>
          )}
          {metaRight && (
            <span className="text-[11px] text-[var(--color-ink-faint)] tabular">
              {metaRight}
            </span>
          )}
        </div>
      )}
    </>
  );

  const className =
    "block bg-white border border-[var(--color-line)] rounded-lg p-3 hover:border-[var(--color-brand-300)] hover:shadow-[var(--shadow-sm)] transition-all";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
