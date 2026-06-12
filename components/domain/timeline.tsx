import type { ReactNode } from "react";

export type TimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative pl-5">
      <span className="absolute left-1.5 top-2 bottom-2 w-px bg-[var(--color-line)]" />
      {items.map((item) => (
        <li key={item.id} className="relative mb-4 last:mb-0">
          <span
            className="absolute -left-[15px] top-1 w-3 h-3 rounded-full border-2 border-white"
            style={{ background: "var(--color-brand-500)" }}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                  {item.subtitle}
                </p>
              )}
            </div>
            {item.trailing}
          </div>
        </li>
      ))}
    </ol>
  );
}
