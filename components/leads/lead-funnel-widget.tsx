"use client";

import { useCallback, useEffect, useId, useState } from "react";

import type { LeadFunnelResponse } from "@/server/services/lead-funnel";
import type { FunnelBucketCount, LeadFunnelDateRange } from "@/lib/lead-funnel-metrics";
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
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
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

function StageBar({
  row,
  widthPct,
  tone,
  tooltip,
  active,
  onSelect,
}: {
  row: FunnelBucketCount;
  widthPct: number;
  tone: "active" | "won" | "exit" | "exit-sub";
  tooltip: string;
  active: boolean;
  onSelect: () => void;
}) {
  const secondary = secondaryMetric(row);
  const toneClass =
    tone === "won"
      ? "bg-[var(--color-success-bg, #ecfdf5)] border-[var(--color-success-border,#a7f3d0)] text-[var(--color-success-fg,#047857)]"
      : tone === "exit"
        ? "bg-[#fff7ed] border-[#fed7aa] text-[#9a3412]"
        : tone === "exit-sub"
          ? "bg-[var(--color-muted)] border-[var(--color-line)] text-[var(--color-ink-soft)]"
          : "bg-[var(--color-brand-50)] border-[var(--color-brand-100)] text-[var(--color-brand-800)]";

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={`${row.label}: ${row.count} leads, ${secondary.value} ${secondary.hint}. ${tooltip}`}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors focus-ring",
        toneClass,
        active && "ring-2 ring-[var(--color-brand-500)] ring-offset-1",
        "hover:brightness-[0.98]",
      )}
      style={{ maxWidth: `${Math.max(42, widthPct)}%`, marginInline: "auto" }}
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
        {row.label}
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums">
        {row.count}
      </span>
      <span className="shrink-0 text-right text-[11px] leading-tight tabular-nums opacity-70">
        <span className="block">{secondary.value}</span>
        <span className="block text-[9.5px] opacity-80">{secondary.hint}</span>
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

  const stageCount = data?.funnel.activeStages.length ?? 1;

  function isActive(statusIds: string[]): boolean {
    if (activeStatusIds.length === 0 || statusIds.length === 0) return false;
    if (activeStatusIds.length !== statusIds.length) return false;
    const active = new Set(activeStatusIds);
    return statusIds.every((id) => active.has(id));
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "w-full max-w-[360px] rounded-lg border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-[13px] font-semibold tracking-tight text-[var(--color-ink)]"
          >
            Lead funnel
          </h2>
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            {loading
              ? "Loading…"
              : data
                ? `${data.funnel.totalLeads} total leads`
                : "—"}
          </p>
          {data?.scopeNote ? (
            <p className="text-[10.5px] leading-snug text-[var(--color-ink-faint)]">
              {data.scopeNote}
            </p>
          ) : null}
        </div>
        <label className="sr-only" htmlFor={`${titleId}-range`}>
          Funnel date range
        </label>
        <select
          id={`${titleId}-range`}
          className="h-7 max-w-[7.5rem] shrink-0 rounded-md border border-[var(--color-line)] bg-white px-1.5 text-[11.5px] text-[var(--color-ink-soft)] focus-ring"
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
        <p className="text-[12px] text-[var(--color-danger-fg)]" role="alert">
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
        <div className="space-y-1.5">
          <p className="text-[10.5px] text-[var(--color-ink-faint)]">
            {data.metricMode === "historical_conversion"
              ? "Counts = current status · % = conversion from prior stage"
              : "Share of total leads (current status)"}
          </p>

          <div className="flex flex-col gap-1" role="list" aria-label="Active funnel stages">
            {data.funnel.activeStages.map((row, index) => {
              const widthPct = 100 - index * (40 / Math.max(stageCount - 1, 1));
              return (
                <div key={row.bucket} role="listitem">
                  <StageBar
                    row={row}
                    widthPct={widthPct}
                    tone="active"
                    tooltip={data.funnel.rateTooltips[row.bucket] ?? ""}
                    active={isActive(row.statusIds)}
                    onSelect={() => onFilterStatuses(row.statusIds)}
                  />
                </div>
              );
            })}
          </div>

          <div
            className="relative mt-1 border-t border-dashed border-[var(--color-line)] pt-2"
            aria-label="Outcomes"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-2 left-1/2 h-2 w-px -translate-x-1/2 bg-[var(--color-line)]"
            />
            {data.funnel.won ? (
              <div className="mb-1">
                <StageBar
                  row={data.funnel.won}
                  widthPct={72}
                  tone="won"
                  tooltip={data.funnel.rateTooltips.won ?? ""}
                  active={isActive(data.funnel.won.statusIds)}
                  onSelect={() => onFilterStatuses(data.funnel.won!.statusIds)}
                />
              </div>
            ) : null}

            <button
              type="button"
              title={data.funnel.rateTooltips.exited}
              aria-label={`Exited: ${data.funnel.exited.count} leads, ${formatShare(data.funnel.exited.shareOfTotal)} of total`}
              aria-pressed={isActive(data.funnel.exited.statusIds)}
              onClick={() => onFilterStatuses(data.funnel.exited.statusIds)}
              className={cn(
                "mb-1 flex w-[85%] mx-auto items-center gap-2 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-1.5 text-left text-[#9a3412] focus-ring",
                isActive(data.funnel.exited.statusIds) &&
                  "ring-2 ring-[var(--color-brand-500)] ring-offset-1",
              )}
            >
              <span className="min-w-0 flex-1 text-[12px] font-medium">Exited</span>
              <span className="text-[13px] font-semibold tabular-nums">
                {data.funnel.exited.count}
              </span>
              <span className="text-[11px] tabular-nums opacity-70">
                {formatShare(data.funnel.exited.shareOfTotal)}
              </span>
            </button>

            <div className="space-y-1 pl-2" role="list" aria-label="Exit reasons">
              {data.funnel.exited.reasons.map((row) => (
                <div key={row.bucket} role="listitem">
                  <StageBar
                    row={row}
                    widthPct={78}
                    tone="exit-sub"
                    tooltip={data.funnel.rateTooltips[row.bucket] ?? ""}
                    active={isActive(row.statusIds)}
                    onSelect={() => onFilterStatuses(row.statusIds)}
                  />
                </div>
              ))}
              {data.funnel.exited.other ? (
                <div role="listitem">
                  <StageBar
                    row={data.funnel.exited.other}
                    widthPct={78}
                    tone="exit-sub"
                    tooltip={data.funnel.rateTooltips.other ?? ""}
                    active={isActive(data.funnel.exited.other.statusIds)}
                    onSelect={() =>
                      onFilterStatuses(data.funnel.exited.other!.statusIds)
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>

          <p
            className="pt-1 text-[11px] leading-snug text-[var(--color-ink-muted)]"
            title={
              data.benchmark.population === "insufficient"
                ? "Need more peer projects with enough leads to compute a median benchmark."
                : data.benchmark.population === "same_project_type"
                  ? "Compared with the median of same-type projects that have enough leads."
                  : "Compared with the median of active projects that have enough leads."
            }
          >
            <span className="text-[var(--color-ink-faint)]">vs benchmark:</span>{" "}
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
              <span className="text-[var(--color-ink-faint)]">insufficient data</span>
            )}
          </p>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="h-28 animate-pulse rounded-md bg-[var(--color-muted)]" />
      ) : null}
    </section>
  );
}
