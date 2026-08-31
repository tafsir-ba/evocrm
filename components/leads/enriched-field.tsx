"use client";

import { Badge } from "@/components/ui/badge";
import { originLabel } from "@/lib/lead-enrichment";
import type { LeadEnrichmentSuggestion } from "@/lib/lead-enrichment";
import type { LeadFieldProvenanceMethod } from "@/lib/lead-intelligence";

export function EnrichedField({
  value,
  origin,
  suggestion,
  onClear,
  onApplyOverwrite,
  editing,
  onEdit,
}: {
  value: string;
  origin?: LeadFieldProvenanceMethod | "unknown" | null;
  suggestion?: LeadEnrichmentSuggestion | null;
  onClear?: () => void;
  onApplyOverwrite?: () => void;
  editing?: boolean;
  onEdit?: (next: string) => void;
}) {
  const isEnriched = origin === "enrichment";
  const pendingOverwrite =
    suggestion &&
    suggestion.status === "proposed" &&
    Boolean(suggestion.currentValue?.trim()) &&
    suggestion.proposedValue !== suggestion.currentValue;

  return (
    <div className="space-y-1 min-w-0">
      <p
        className={
          isEnriched
            ? "text-[13.5px] text-[var(--color-ink)] rounded-md px-1.5 py-0.5 -mx-1.5 bg-[var(--color-enrich-bg)]/70 border border-[var(--color-enrich-border)]/80"
            : "text-[13.5px] text-[var(--color-ink)]"
        }
      >
        {onEdit && editing ? (
          <input
            className="w-full bg-transparent outline-none"
            defaultValue={value === "—" ? "" : value}
            onBlur={(event) => onEdit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onEdit((event.target as HTMLInputElement).value);
              }
            }}
          />
        ) : (
          value
        )}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {origin ? (
          <EnrichmentOriginTooltip
            method={origin}
            suggestion={isEnriched ? suggestion : null}
          />
        ) : null}
        {isEnriched && onClear ? (
          <button
            type="button"
            className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-danger-fg)]"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>
      {pendingOverwrite ? (
        <div className="rounded-md border border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/50 px-2 py-1.5">
          <p className="text-[12px] text-[var(--color-enrich-fg)]">
            Suggested: {suggestion.proposedValue} ({suggestion.confidencePercent}%)
          </p>
          {onApplyOverwrite ? (
            <button
              type="button"
              className="mt-1 text-[11.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              onClick={onApplyOverwrite}
            >
              Replace CRM value
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EnrichmentOriginTooltip({
  method,
  suggestion,
}: {
  method: LeadFieldProvenanceMethod | "unknown";
  suggestion?: LeadEnrichmentSuggestion | null;
}) {
  const tone = method === "enrichment" ? "enrich" : method === "import" ? "warn" : "muted";
  return (
    <span className="relative inline-flex group">
      <Badge tone={tone} size="sm">
        {originLabel(method)}
        {method === "enrichment" && suggestion
          ? ` · ${suggestion.confidencePercent}%`
          : ""}
      </Badge>
      {method === "enrichment" && suggestion ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 hidden w-72 rounded-lg border border-[var(--color-enrich-border)] bg-white p-2.5 text-[12px] text-[var(--color-ink-soft)] shadow-[var(--shadow-md)] group-hover:block group-focus-within:block"
        >
          <p className="font-medium text-[var(--color-ink)] mb-1">
            Source-quality / identity-match confidence, not a truth claim.
          </p>
          <p className="mb-1">{suggestion.rationale}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)] mb-1">
            {suggestion.searchProvider} · {suggestion.aiModel}
            {suggestion.retrievedAt ? ` · ${suggestion.retrievedAt}` : ""}
          </p>
          <ul className="space-y-0.5">
            {suggestion.sourceUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-brand-700)] hover:underline break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}
