import type { ReactNode } from "react";

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
    <div className="flex flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)]">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {accentColor ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: accentColor }}
            />
          ) : null}
          <span className="truncate text-[12.5px] font-semibold text-[var(--color-ink)]">
            {title}
          </span>
          <span className="rounded border border-[var(--color-line)] bg-white px-1 py-px text-[11px] tabular text-[var(--color-ink-muted)]">
            {count}
          </span>
        </div>
      </div>
      {summary ? (
        <div className="px-2.5 pb-1.5 text-[11px] tabular text-[var(--color-ink-muted)]">
          {summary}
        </div>
      ) : null}
      <div className="space-y-1.5 px-1.5 pb-2">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-[var(--color-ink-muted)]">{emptyLabel}</p>
        ) : (
          cards.map((card) => <div key={card.id}>{renderCard(card)}</div>)
        )}
      </div>
    </div>
  );
}
