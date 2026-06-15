"use client";

import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";

export type TabItem = {
  key: string;
  label: ReactNode;
  count?: number;
  content?: ReactNode;
};

export function Tabs({
  items,
  defaultKey,
  activeKey,
  onChange,
  className,
}: {
  items: TabItem[];
  defaultKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  className?: string;
}) {
  const [internalActive, setInternalActive] = useState(defaultKey ?? items[0]?.key);
  const active = activeKey ?? internalActive;

  function setActive(key: string) {
    if (onChange) {
      onChange(key);
    } else {
      setInternalActive(key);
    }
  }

  return (
    <div className={cn(className)}>
      <div
        role="tablist"
        className="flex items-center gap-1 border-b border-[var(--color-line)] overflow-x-auto"
      >
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(it.key)}
              className={cn(
                "relative h-10 px-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors focus-ring",
                isActive
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              )}
            >
              {it.label}
              {typeof it.count === "number" && (
                <span
                  className={cn(
                    "ml-0.5 text-[11.5px] px-1.5 py-[1px] rounded-full",
                    isActive
                      ? "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]"
                      : "bg-[var(--color-muted)] text-[var(--color-ink-muted)]",
                  )}
                >
                  {it.count}
                </span>
              )}
              {isActive && (
                <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-[var(--color-brand-600)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-5">
        {items.find((it) => it.key === active)?.content}
      </div>
    </div>
  );
}
