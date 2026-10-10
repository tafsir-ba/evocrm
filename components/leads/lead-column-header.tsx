"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconArrowDown, IconArrowUp, IconFilter } from "@/lib/icons";
import type { LeadBrowserSort, LeadBrowserSortDir } from "@/lib/lead-browser";
import { cn } from "@/lib/utils";

type LeadColumnHeaderProps = {
  label: string;
  column: LeadBrowserSort;
  sort?: LeadBrowserSort;
  sortDir?: LeadBrowserSortDir;
  onSort: (column: LeadBrowserSort) => void;
  filterActive?: boolean;
  filterLabel?: string;
  className?: string;
  align?: "left" | "right";
  children?: ReactNode;
};

export function LeadColumnHeader({
  label,
  column,
  sort,
  sortDir,
  onSort,
  filterActive = false,
  filterLabel,
  className,
  align = "left",
  children,
}: LeadColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLTableCellElement>(null);
  const active = sort === column;
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <th
      ref={rootRef}
      className={cn("relative px-1.5 py-1 text-left", className)}
      aria-sort={ariaSort}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-0.5",
          align === "right" && "justify-end",
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center gap-0.5 font-semibold uppercase tracking-wide hover:text-[var(--color-ink)]",
            active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]",
          )}
          onClick={() => onSort(column)}
          aria-label={`Sort by ${label}`}
        >
          <span className="truncate">{label}</span>
          {active ? (
            sortDir === "asc" ? (
              <IconArrowUp size={11} aria-hidden />
            ) : (
              <IconArrowDown size={11} aria-hidden />
            )
          ) : null}
        </button>
        {children ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]",
              filterActive && "text-[var(--color-brand-700)]",
              open && "bg-[var(--color-muted)] text-[var(--color-ink)]",
            )}
            aria-label={
              filterActive
                ? `Filter ${label}${filterLabel ? `: ${filterLabel}` : ""}, active`
                : `Filter ${label}`
            }
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            <IconFilter size={11} aria-hidden />
          </button>
        ) : null}
      </div>
      {open && children ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={`${label} column filter`}
          className="absolute left-0 top-[calc(100%+2px)] z-30 w-[14rem] rounded-lg border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-lg)]"
        >
          <div className="space-y-2">{children}</div>
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </th>
  );
}

export function ColumnFilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </span>
      <select
        className="h-8 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)]"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function ColumnFilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </span>
      <input
        className="h-8 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[12.5px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)]"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
