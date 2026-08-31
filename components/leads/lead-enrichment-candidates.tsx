"use client";

import { Badge } from "@/components/ui/badge";
import type { LeadEnrichmentCandidate } from "@/lib/lead-enrichment";
import { cn } from "@/lib/utils";

export function EnrichmentCandidateList({
  candidates,
  selectedId,
  appliedId,
  onSelect,
  disabled,
}: {
  candidates: LeadEnrichmentCandidate[];
  selectedId: string | null;
  appliedId?: string | null;
  onSelect: (candidateId: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {candidates.map((candidate) => {
        const selected = selectedId === candidate.id;
        const applied = appliedId === candidate.id;
        return (
          <li key={candidate.id}>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Choose ${candidate.label}`}
              aria-pressed={selected}
              onClick={() => onSelect(candidate.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-[var(--color-brand-600)] bg-[var(--color-brand-50)]"
                  : "border-[var(--color-line)] bg-white hover:border-[var(--color-line-strong)]",
                disabled && "cursor-not-allowed opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-[var(--color-ink)]">
                  {candidate.label}
                </span>
                {candidate.mostLikely ? (
                  <Badge tone="enrich" size="sm">
                    Most likely
                  </Badge>
                ) : null}
                {applied ? (
                  <Badge tone="success" size="sm">
                    Applied
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink-soft)]">
                {[candidate.headline, candidate.employer, candidate.location]
                  .filter(Boolean)
                  .join(" · ") || "Public professional match"}
              </p>
              {candidate.profileUrl || candidate.sourceUrls[0] ? (
                <a
                  href={candidate.profileUrl ?? candidate.sourceUrls[0]}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-1 inline-block break-all text-[12px] text-[var(--color-brand-700)] hover:underline"
                >
                  {candidate.profileUrl ?? candidate.sourceUrls[0]}
                </a>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
