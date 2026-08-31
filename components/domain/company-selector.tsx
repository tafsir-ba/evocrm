"use client";

import { useMemo, useState } from "react";

import { normalizeCompanyNameKey } from "@/lib/project-operating-record";
import { cn } from "@/lib/utils";

export type CompanySelectorCompany = {
  id: string;
  name: string;
};

export type CompanySelectorProps = {
  companies: CompanySelectorCompany[];
  selectedCompanyId?: string | null;
  onChange?: (companyId: string | null) => void;
  onCreate?: (name: string) => Promise<CompanySelectorCompany | null> | CompanySelectorCompany | null;
  disabled?: boolean;
  creating?: boolean;
  allowCreate?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  searchLabel?: string;
  createLabel?: string;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
};

export function CompanySelector({
  companies,
  selectedCompanyId = null,
  onChange,
  onCreate,
  disabled = false,
  creating = false,
  allowCreate = true,
  placeholder = "Select company…",
  emptyLabel = "No companies yet. Search to create one.",
  searchLabel = "Search companies",
  createLabel = "Create company",
  className,
  id,
  name,
  required = false,
}: CompanySelectorProps) {
  const [query, setQuery] = useState("");

  const selected = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const trimmedQuery = query.trim();
  const needle = trimmedQuery.toLowerCase();

  const visibleCompanies = useMemo(() => {
    const filtered = needle
      ? companies.filter((company) => company.name.toLowerCase().includes(needle))
      : companies;

    if (selected && !filtered.some((company) => company.id === selected.id)) {
      return [selected, ...filtered];
    }

    return filtered;
  }, [companies, needle, selected]);

  const exactMatch = companies.some(
    (company) => normalizeCompanyNameKey(company.name) === normalizeCompanyNameKey(trimmedQuery),
  );
  const canCreate =
    Boolean(allowCreate && onCreate && trimmedQuery && !exactMatch && !disabled && !creating);

  if (!onChange) {
    return (
      <p className={cn("text-[13px] text-[var(--color-ink)]", className)}>
        {selected?.name ?? placeholder}
      </p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search or create…"
        aria-label={searchLabel}
        disabled={disabled}
        className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring"
      />
      {companies.length === 0 && !trimmedQuery ? (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">{emptyLabel}</p>
      ) : null}
      <select
        id={id}
        name={name}
        required={required}
        value={selectedCompanyId ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "" ? null : value);
        }}
        className={cn(
          "w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <option value="">{placeholder}</option>
        {visibleCompanies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      {canCreate ? (
        <button
          type="button"
          disabled={creating}
          onClick={() => {
            void Promise.resolve(onCreate?.(trimmedQuery)).then((created) => {
              if (created) {
                onChange(created.id);
                setQuery("");
              }
            });
          }}
          className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline focus-ring rounded"
        >
          {creating ? "Creating…" : `${createLabel} “${trimmedQuery}”`}
        </button>
      ) : null}
    </div>
  );
}
