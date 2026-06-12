import type { ReactNode } from "react";
import { IconMore, IconPlus } from "@/lib/icons";

export type KanbanCardData = {
  id: string;
  title: string;
  subtitle?: string;
  metaLeft?: string;
  metaRight?: string;
  avatar?: ReactNode;
  href?: string;
};

export function KanbanColumn({
  title,
  count,
  accentColor,
  summary,
  cards,
  renderCard,
  emptyLabel = "No items",
}: {
  title: string;
  count: number;
  accentColor?: string;
  summary?: ReactNode;
  cards: KanbanCardData[];
  renderCard: (card: KanbanCardData) => ReactNode;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col bg-[var(--color-canvas)] border border-[var(--color-line)] rounded-xl">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {accentColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: accentColor }}
            />
          )}
          <span className="text-[13px] font-semibold text-[var(--color-ink)]">
            {title}
          </span>
          <span className="text-[11.5px] text-[var(--color-ink-muted)] tabular bg-white border border-[var(--color-line)] rounded-md px-1.5 py-[1px]">
            {count}
          </span>
        </div>
        <button
          type="button"
          aria-label="Column actions"
          className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-white"
        >
          <IconMore size={14} />
        </button>
      </div>
      {summary && (
        <div className="px-3 pb-2 text-[11.5px] text-[var(--color-ink-muted)] tabular">
          {summary}
        </div>
      )}
      <div className="flex-1 px-2 pb-2 space-y-2 min-h-[200px]">
        {cards.length === 0 ? (
          <div className="border border-dashed border-[var(--color-line-strong)] rounded-lg p-4 text-center">
            <p className="text-[12px] text-[var(--color-ink-muted)]">{emptyLabel}</p>
          </div>
        ) : (
          cards.map((card) => (
            <div key={card.id}>{renderCard(card)}</div>
          ))
        )}
      </div>
      <button
        type="button"
        className="m-2 mt-1 h-8 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] border border-dashed border-[var(--color-line)] rounded-lg hover:text-[var(--color-brand-700)] hover:border-[var(--color-brand-300)] hover:bg-white transition-colors"
      >
        <IconPlus size={13} /> Add card
      </button>
    </div>
  );
}
