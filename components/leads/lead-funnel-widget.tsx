"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { LeadFunnelResponse } from "@/server/services/lead-funnel";
import type {
  FunnelBucketCount,
  LeadFunnelDateRange,
} from "@/lib/lead-funnel-metrics";
import { IconChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

type LeadFunnelWidgetProps = {
  workspaceSlug: string;
  projectId: string;
  /** Currently applied status filter ids for highlight. */
  activeStatusIds?: string[];
  onFilterStatuses: (statusIds: string[]) => void;
  className?: string;
};

const RANGE_OPTIONS: Array<{ value: LeadFunnelDateRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

function formatShare(share: number | null): string {
  if (share === null) return "—";
  return `${Math.round(share * 100)}%`;
}

function secondaryMetric(row: FunnelBucketCount): {
  value: string;
  hint: string;
} {
  if (row.conversionLabel) {
    return {
      value: formatShare(row.conversionFromPrior),
      hint: row.conversionLabel,
    };
  }
  return {
    value: formatShare(row.shareOfTotal),
    hint: "of total",
  };
}

function StageRow({
  row,
  tone,
  tooltip,
  active,
  onSelect,
  indent = false,
}: {
  row: FunnelBucketCount;
  tone: "active" | "won" | "exit" | "exit-sub";
  tooltip: string;
  active: boolean;
  onSelect: () => void;
  indent?: boolean;
}) {
  const secondary = secondaryMetric(row);
  const toneClass =
    tone === "won"
      ? "bg-[var(--color-success-bg,#ecfdf5)] text-[var(--color-success-fg,#047857)]"
      : tone === "exit"
        ? "bg-[#fff7ed] text-[#9a3412]"
        : tone === "exit-sub"
          ? "bg-transparent text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
          : "bg-[var(--color-brand-50)] text-[var(--color-brand-800)]";

  return (
    <button
      type="button"
      title={`${tooltip} (${secondary.value} ${secondary.hint})`}
      aria-label={`${row.label}: ${row.count} leads, ${secondary.value} ${secondary.hint}. ${tooltip}`}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors focus-ring",
        toneClass,
        indent && "pl-3",
        active && "ring-1 ring-[var(--color-brand-500)]",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
      <span className="shrink-0 tabular-nums font-semibold">{row.count}</span>
      <span className="w-8 shrink-0 text-right tabular-nums opacity-70">
        {secondary.value}
      </span>
    </button>
  );
}

export function LeadFunnelWidget({
  workspaceSlug,
  projectId,
  activeStatusIds = [],
  onFilterStatuses,
  className,
}: LeadFunnelWidgetProps) {
  const titleId = useId();
  const [range, setRange] = useState<LeadFunnelDateRange>("all");
  const [data, setData] = useState<LeadFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/lead-funnel?range=${range}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load funnel.");
      }
      const next = payload.data as LeadFunnelResponse | null;
      if (!next?.funnel?.activeStages) {
        throw new Error("Invalid funnel response.");
      }
      setData(next);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load funnel.",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  function isActive(statusIds: string[]): boolean {
    if (activeStatusIds.length === 0 || statusIds.length === 0) return false;
    if (activeStatusIds.length !== statusIds.length) return false;
    const active = new Set(activeStatusIds);
    return statusIds.every((id) => active.has(id));
  }

  const metricHint =
    data?.metricMode === "historical_conversion"
      ? "Counts = current status · % = conversion from prior stage"
      : "Share of total leads (current status)";

  return (
    <section
      aria-labelledby={titleId}
      title={[data?.scopeNote, metricHint].filter(Boolean).join(" · ")}
      className={cn(
        "w-full rounded-md border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1.5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[11px] font-semibold tracking-tight text-[var(--color-ink)]"
          >
            Funnel
          </h2>
          <p className="truncate text-[10px] text-[var(--color-ink-muted)]">
            {loading
              ? "Loading…"
              : data
                ? `${data.funnel.totalLeads} leads`
                : "—"}
          </p>
        </div>
        <label className="sr-only" htmlFor={`${titleId}-range`}>
          Funnel date range
        </label>
        <select
          id={`${titleId}-range`}
          className="h-6 max-w-[4.25rem] shrink-0 rounded border border-[var(--color-line)] bg-white px-1 text-[10px] text-[var(--color-ink-soft)] focus-ring"
          value={range}
          onChange={(event) =>
            setRange(event.target.value as LeadFunnelDateRange)
          }
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-[11px] text-[var(--color-danger-fg)]" role="alert">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <div className="space-y-0.5">
          <div
            className="flex flex-col gap-0.5"
            role="list"
            aria-label="Active funnel stages"
          >
            {data.funnel.activeStages.map((row) => (
              <div key={row.bucket} role="listitem">
                <StageRow
                  row={row}
                  tone="active"
                  tooltip={data.funnel.rateTooltips[row.bucket] ?? ""}
                  active={isActive(row.statusIds)}
                  onSelect={() => onFilterStatuses(row.statusIds)}
                />
              </div>
            ))}
          </div>

          <div
            className="mt-1 space-y-0.5 border-t border-dashed border-[var(--color-line)] pt-1"
            aria-label="Outcomes"
          >
            {data.funnel.won ? (
              <StageRow
                row={data.funnel.won}
                tone="won"
                tooltip={data.funnel.rateTooltips.won ?? ""}
                active={isActive(data.funnel.won.statusIds)}
                onSelect={() => onFilterStatuses(data.funnel.won!.statusIds)}
              />
            ) : null}

            <button
              type="button"
              title={data.funnel.rateTooltips.exited}
              aria-label={`Exited: ${data.funnel.exited.count} leads, ${formatShare(data.funnel.exited.shareOfTotal)} of total`}
              aria-pressed={isActive(data.funnel.exited.statusIds)}
              onClick={() => onFilterStatuses(data.funnel.exited.statusIds)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded bg-[#fff7ed] px-1.5 py-0.5 text-left text-[11px] leading-tight text-[#9a3412] focus-ring",
                isActive(data.funnel.exited.statusIds) &&
                  "ring-1 ring-[var(--color-brand-500)]",
              )}
            >
              <span className="min-w-0 flex-1 font-medium">Exited</span>
              <span className="shrink-0 tabular-nums font-semibold">
                {data.funnel.exited.count}
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums opacity-70">
                {formatShare(data.funnel.exited.shareOfTotal)}
              </span>
            </button>

            <div role="list" aria-label="Exit reasons">
              {data.funnel.exited.reasons.map((row) => (
                <div key={row.bucket} role="listitem">
                  <StageRow
                    row={row}
                    tone="exit-sub"
                    tooltip={data.funnel.rateTooltips[row.bucket] ?? ""}
                    active={isActive(row.statusIds)}
                    onSelect={() => onFilterStatuses(row.statusIds)}
                    indent
                  />
                </div>
              ))}
              {data.funnel.exited.other ? (
                <div role="listitem">
                  <StageRow
                    row={data.funnel.exited.other}
                    tone="exit-sub"
                    tooltip={data.funnel.rateTooltips.other ?? ""}
                    active={isActive(data.funnel.exited.other.statusIds)}
                    onSelect={() =>
                      onFilterStatuses(data.funnel.exited.other!.statusIds)
                    }
                    indent
                  />
                </div>
              ) : null}
            </div>
          </div>

          <p
            className="truncate pt-0.5 text-[10px] leading-snug text-[var(--color-ink-muted)]"
            title={
              data.benchmark.population === "insufficient"
                ? "Need more peer projects with enough leads to compute a median benchmark."
                : data.benchmark.population === "same_project_type"
                  ? "Compared with the median of same-type projects that have enough leads."
                  : "Compared with the median of active projects that have enough leads."
            }
          >
            <span className="text-[var(--color-ink-faint)]">vs </span>
            {data.benchmark.summary ? (
              data.benchmark.deltas?.map((delta, index) => (
                <span key={delta.key}>
                  {index > 0 ? (
                    <span className="text-[var(--color-ink-faint)]"> · </span>
                  ) : null}
                  <span
                    className={cn(
                      delta.favourable === true &&
                        "text-[var(--color-success-fg,#047857)]",
                      delta.favourable === false && "text-[#b45309]",
                    )}
                  >
                    {delta.label}{" "}
                    {delta.deltaPp === 0
                      ? "—"
                      : `${delta.deltaPp > 0 ? "+" : ""}${delta.deltaPp}pp`}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-[var(--color-ink-faint)]">n/a</span>
            )}
          </p>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="h-20 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : null}
    </section>
  );
}

/** Compact Funnel ▾ control for the leads filter bar — details on demand. */
export function LeadFunnelMenu({
  workspaceSlug,
  projectId,
  activeStatusIds = [],
  onFilterStatuses,
  className,
}: LeadFunnelWidgetProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={cn("relative shrink-0", className)} ref={rootRef}>
      <button
        type="button"
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] focus-ring",
          open && "border-[var(--color-brand-300)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Funnel
        <IconChevronDown size={14} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Lead funnel"
          className="absolute right-0 top-full z-30 mt-1 w-[min(100vw-2rem,220px)]"
        >
          <LeadFunnelWidget
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            activeStatusIds={activeStatusIds}
            onFilterStatuses={(statusIds) => {
              onFilterStatuses(statusIds);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
