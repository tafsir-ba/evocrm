"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SwipeToSuppressRow } from "@/components/visit-notes/swipe-to-suppress-row";
import { cn } from "@/lib/utils";
import { formatVisitSessionFallbackTitle } from "@/lib/visit-notes";

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
  onSuppress,
  creating,
  suppressingId,
}: {
  open: boolean;
  onClose: () => void;
  items: VisitHistoryItem[];
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onSuppress: (sessionId: string) => void | Promise<void>;
  creating?: boolean;
  suppressingId?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Conversations"
      side="left"
      className="w-[min(100%,20rem)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:w-[22rem] md:w-[22rem]"
      footer={
        <Button
          className="w-full min-h-11 touch-manipulation"
          onClick={onNew}
          loading={creating}
          disabled={creating || Boolean(suppressingId)}
        >
          New conversation
        </Button>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[12.5px] text-[var(--color-danger-fg)]"
        >
          {error}
        </p>
      )}
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
          const suppressing = suppressingId === item.id;
          return (
            <li key={item.id}>
              <SwipeToSuppressRow
                suppressing={suppressing}
                disabled={Boolean(suppressingId) && !suppressing}
                onSuppress={() => {
                  setError(null);
                  void Promise.resolve(onSuppress(item.id)).catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not delete conversation.",
                    );
                  });
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  disabled={suppressing}
                  className={cn(
                    "w-full min-w-0 rounded-xl px-3 py-3 text-left touch-manipulation hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)] disabled:opacity-60",
                    active && "bg-[var(--color-brand-50)]",
                  )}
                >
                  <p className="truncate text-[15px] font-medium leading-snug text-[var(--color-ink)]">
                    {title}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--color-ink-muted)]">
                    {[item.leadName, item.propertyLabel].filter(Boolean).join(" · ") ||
                      "Lead"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                    {when}
                  </p>
                </button>
              </SwipeToSuppressRow>
            </li>
          );
        })}
      </ul>
      {items.length > 0 && (
        <p className="mt-3 px-1 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
          Swipe left on a conversation to delete it.
        </p>
      )}
    </Drawer>
  );
}
