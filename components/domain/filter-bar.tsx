"use client";

import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/domain/search-input";
import { IconFilter } from "@/lib/icons";
import type { ReactNode } from "react";

export function FilterBar({
  search,
  selects,
  children,
  searchPlaceholder = "Search…",
}: {
  search?: boolean;
  selects?: { label: string; options: string[] }[];
  children?: ReactNode;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {search && (
        <div className="flex-1 min-w-[200px] max-w-md">
          <SearchInput placeholder={searchPlaceholder} />
        </div>
      )}
      {selects?.map((s) => (
        <Select key={s.label} fieldSize="sm" className="w-auto min-w-[140px]">
          <option>{s.label}</option>
          {s.options.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </Select>
      ))}
      {children}
      <button
        type="button"
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-white text-[13px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] focus-ring"
      >
        <IconFilter size={14} /> Filters
      </button>
    </div>
  );
}
