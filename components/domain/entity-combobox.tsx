"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Input } from "@/components/ui/input";
import { IconSearch } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type EntityComboboxOption = {
  id: string;
  label: string;
  meta?: string;
  projectId?: string | null;
  projectName?: string | null;
  /** Extra payload for callers (e.g. property currency). */
  data?: Record<string, unknown>;
};

export type EntityComboboxSearchResult = {
  options: EntityComboboxOption[];
  total: number;
};

type EntityComboboxProps = {
  id?: string;
  value: string;
  selectedOption?: EntityComboboxOption | null;
  onChange: (option: EntityComboboxOption | null) => void;
  onSearch: (query: string) => Promise<EntityComboboxSearchResult>;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  hint?: ReactNode;
  "aria-label"?: string;
};

const SEARCH_DEBOUNCE_MS = 250;

export function EntityCombobox({
  id,
  value,
  selectedOption = null,
  onChange,
  onSearch,
  placeholder = "Search…",
  disabled = false,
  emptyMessage = "No matches found.",
  hint,
  "aria-label": ariaLabel,
}: EntityComboboxProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<EntityComboboxOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const displayValue =
    open || query.length > 0
      ? query
      : selectedOption?.label ?? "";

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await onSearch(rawQuery);
        if (requestId !== requestIdRef.current) {
          return;
        }
        setOptions(result.options);
        setTotal(result.total);
        setActiveIndex(0);
      } catch (searchError) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setOptions([]);
        setTotal(0);
        setError(
          searchError instanceof Error ? searchError.message : "Failed to search.",
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [onSearch],
  );

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, open, query, runSearch]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectOption(option: EntityComboboxOption) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setOpen(true);
    const input = containerRef.current?.querySelector("input");
    input?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        options.length === 0 ? 0 : Math.min(current + 1, options.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && options[activeIndex]) {
      event.preventDefault();
      selectOption(options[activeIndex]!);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        leadingIcon={<IconSearch size={15} />}
        trailingIcon={
          value && !disabled ? (
            <button
              type="button"
              className="text-[12px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              onClick={(event) => {
                event.preventDefault();
                clearSelection();
              }}
            >
              Clear
            </button>
          ) : undefined
        }
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) {
            onChange(null);
          }
        }}
        onKeyDown={handleKeyDown}
      />

      {hint ? (
        <p className="mt-1.5 text-[12px] text-[var(--color-ink-muted)]">{hint}</p>
      ) : null}

      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--color-line)] bg-white shadow-md"
        >
          {loading ? (
            <p className="px-3 py-2 text-[12.5px] text-[var(--color-ink-muted)]">Searching…</p>
          ) : null}
          {error ? (
            <p className="px-3 py-2 text-[12.5px] text-[var(--color-danger-fg)]">{error}</p>
          ) : null}
          {!loading && !error && options.length === 0 ? (
            <p className="px-3 py-2 text-[12.5px] text-[var(--color-ink-muted)]">{emptyMessage}</p>
          ) : null}
          {!loading &&
            !error &&
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value || index === activeIndex}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--color-canvas)]",
                  (option.id === value || index === activeIndex) &&
                    "bg-[var(--color-brand-50)]",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span className="text-[13.5px] font-medium text-[var(--color-ink)]">
                  {option.label}
                </span>
                {option.meta ? (
                  <span className="text-[12px] text-[var(--color-ink-muted)]">{option.meta}</span>
                ) : null}
              </button>
            ))}
          {!loading && !error && total > options.length ? (
            <p className="border-t border-[var(--color-line)] px-3 py-2 text-[11.5px] text-[var(--color-ink-faint)]">
              Showing {options.length} of {total}. Refine your search for more.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
