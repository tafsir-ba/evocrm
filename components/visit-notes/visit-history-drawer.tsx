"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  formatVisitSessionFallbackTitle,
} from "@/lib/visit-notes";

export type VisitHistoryItem = {
  id: string;
  title: string | null;
  status: string;
  updatedAt: string;
  createdAt: string;
  leadName: string | null;
  propertyLabel: string | null;
};

export function VisitHistoryDrawer({
  open,
  onClose,
  items,
  currentSessionId,
  onSelect,
  onNew,
  creating,
}: {
  open: boolean;
  onClose: () => void;
  items: VisitHistoryItem[];
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  creating?: boolean;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Conversations"
      side="left"
      className="w-[min(100%,22rem)] md:w-[22rem]"
      footer={
        <Button
          className="w-full"
          onClick={onNew}
          loading={creating}
          disabled={creating}
        >
          New conversation
        </Button>
      }
    >
      <ul className="space-y-1" data-testid="visit-history-list">
        {items.length === 0 && (
          <li className="px-1 py-6 text-center text-[13px] text-[var(--color-ink-muted)]">
            No conversations yet.
          </li>
        )}
        {items.map((item) => {
          const title =
            item.title?.trim() ||
            formatVisitSessionFallbackTitle(item.createdAt);
          const updated = new Date(item.updatedAt);
          const when = Number.isNaN(updated.getTime())
            ? ""
            : updated.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
          const active = item.id === currentSessionId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left hover:bg-[var(--color-muted)]",
                  active && "bg-[var(--color-brand-50)]",
                )}
              >
                <p className="truncate text-[13.5px] font-medium text-[var(--color-ink)]">
                  {title}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                  {[item.leadName, item.propertyLabel].filter(Boolean).join(" · ") ||
                    "Visit"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                  {when}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
