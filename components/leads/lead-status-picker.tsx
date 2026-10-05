"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { IconCheck, IconChevronDown, IconPlus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { workspacePath } from "@/lib/workspace-paths";

export type LeadStatusOption = {
  id: string;
  label: string;
  color: string;
};

type LeadStatusPickerProps = {
  workspaceSlug: string;
  leadName: string;
  status: LeadStatusOption | null;
  statuses: LeadStatusOption[];
  disabled?: boolean;
  canCreate: boolean;
  onSelect: (statusId: string) => void;
  onCreate: (label: string) => Promise<void>;
};

export function LeadStatusPicker({
  workspaceSlug,
  leadName,
  status,
  statuses,
  disabled,
  canCreate,
  onSelect,
  onCreate,
}: LeadStatusPickerProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const normalized = trimmed.toLowerCase();
  const filtered = useMemo(
    () =>
      normalized
        ? statuses.filter((option) => option.label.toLowerCase().includes(normalized))
        : statuses,
    [normalized, statuses],
  );
  const hasExactMatch = statuses.some((option) => option.label.toLowerCase() === normalized);
  const showCreate = canCreate && trimmed.length > 0 && !hasExactMatch;
  const optionCount = filtered.length + (showCreate ? 1 : 0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setError(null);
  }, []);

  function choose(statusId: string) {
    close();
    if (statusId !== status?.id) {
      onSelect(statusId);
    }
  }

  async function create() {
    if (creating || !trimmed) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(trimmed);
      close();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the status.");
    } finally {
      setCreating(false);
    }
  }

  function activate(index: number) {
    const option = filtered[index];
    if (option) {
      choose(option.id);
    } else if (showCreate) {
      void create();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (optionCount === 0 ? 0 : (current + 1) % optionCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        optionCount === 0 ? 0 : (current - 1 + optionCount) % optionCount,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (optionCount > 0) activate(Math.min(activeIndex, optionCount - 1));
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-label={`Change status for ${leadName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        className="group/status inline-flex max-w-full items-center gap-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-100)] disabled:opacity-60"
      >
        {status ? (
          <StatusBadge label={status.label} color={status.color} size="sm" />
        ) : (
          <span className="text-[12px] text-[var(--color-ink-faint)]">Set status</span>
        )}
        <IconChevronDown
          size={12}
          className="shrink-0 text-[var(--color-ink-faint)] group-hover/status:text-[var(--color-ink-muted)]"
        />
      </button>

      <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        onClose={close}
        label={`Status for ${leadName}`}
        width={232}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={canCreate ? "Find or create a status…" : "Find a status…"}
          aria-label={canCreate ? "Find or create a status" : "Find a status"}
          maxLength={120}
          className="mb-1 h-10 w-full rounded-md md:h-7 border border-[var(--color-line)] px-2 text-[12.5px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)]"
        />

        <div role="listbox" aria-label="Lead statuses" className="max-h-60 overflow-y-auto">
          {filtered.map((option, index) => {
            const selected = option.id === status?.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.id)}
                className={cn(
                  "flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-[var(--color-ink-soft)] md:h-8 md:text-[12.5px]",
                  index === activeIndex && "bg-[var(--color-muted)]",
                )}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? (
                  <IconCheck size={13} className="shrink-0 text-[var(--color-brand-600)]" />
                ) : null}
              </button>
            );
          })}

          {showCreate ? (
            <button
              type="button"
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() => void create()}
              disabled={creating}
              className={cn(
                "flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] font-medium text-[var(--color-brand-700)] disabled:opacity-60 md:h-8 md:text-[12.5px]",
                activeIndex === filtered.length && "bg-[var(--color-muted)]",
              )}
            >
              <IconPlus size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {creating ? "Creating…" : `Create status “${trimmed}”`}
              </span>
            </button>
          ) : null}

          {optionCount === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)]">
              No matching status.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="px-2 pt-1 text-[12px] text-[var(--color-danger-fg)]">
            {error}
          </p>
        ) : null}

        {canCreate ? (
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--color-line)] px-2 pt-1.5 text-[11px] text-[var(--color-ink-muted)]">
            <span>New statuses apply to every project.</span>
            <Link
              href={workspacePath(workspaceSlug, "settings", "dictionaries")}
              className="shrink-0 font-medium text-[var(--color-brand-700)] hover:underline"
            >
              Manage
            </Link>
          </div>
        ) : null}
      </AnchoredPopover>
    </>
  );
}
