"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  crmValueRequiresOverwrite,
  LEAD_ENRICHMENT_FIELD_LABELS,
  type LeadEnrichmentSuggestion,
} from "@/lib/lead-enrichment";

type RunPayload = {
  id: string;
  status: string;
  identityMatch: string | null;
  identityRationale: string | null;
  failureMessage: string | null;
  searchProvider: string | null;
  aiModel: string | null;
  retrievedAt: string | null;
  suggestions: LeadEnrichmentSuggestion[];
  summaryDraft: {
    text: string;
    citationUrls: string[];
    status: string;
  } | null;
  acceptedSummary: {
    text: string;
    citationUrls: string[];
  } | null;
  sources: Array<{ url: string; title: string }>;
  demoMode: boolean;
};

const PROGRESS_STEPS = [
  "Searching public professional sources…",
  "Matching name and email to a unique identity…",
  "Synthesizing cited results…",
  "Filling safe profile fields…",
];

export function LeadEnrichmentModal({
  open,
  onClose,
  workspaceSlug,
  leadId,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  leadId: string;
  onApplied: () => void;
}) {
  const api = `/api/workspaces/${workspaceSlug}/leads/${leadId}/enrichment`;
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [progressIndex, setProgressIndex] = useState(0);
  const [run, setRun] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase("running");
      setProgressIndex(0);
      setRun(null);
      setError(null);
      setSaving(false);
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      setProgressIndex((index) => Math.min(index + 1, PROGRESS_STEPS.length - 1));
    }, 700);

    async function runSearch() {
      setError(null);
      setPhase("running");
      try {
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Enrichment failed.");
        }
        if (cancelled) return;
        const next = payload.data.run as RunPayload;
        setRun(next);
        setPhase("done");
        const appliedSafe = next.suggestions.some(
          (item) => item.status === "accepted" || item.status === "edited",
        );
        if (
          appliedSafe &&
          next.status !== "ambiguous" &&
          next.status !== "failed" &&
          !next.suggestions.some(
            (item) =>
              item.status === "proposed" &&
              crmValueRequiresOverwrite(item.currentValue, item.currentOrigin),
          )
        ) {
          onApplied();
        } else if (appliedSafe) {
          onApplied();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Enrichment failed.");
          setPhase("done");
        }
      }
    }

    void runSearch();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, api, onApplied]);

  const blocked = run?.suggestions.filter(
    (item) =>
      item.status === "proposed" &&
      crmValueRequiresOverwrite(item.currentValue, item.currentOrigin),
  ) ?? [];

  async function applyOverwrites() {
    if (!run || blocked.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${api}/${run.id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions: blocked.map((item) => ({
            suggestionId: item.id,
            action: "accept",
            overwriteAcknowledged: true,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not apply suggestions.");
      }
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply suggestions.");
    } finally {
      setSaving(false);
    }
  }

  const summary = run?.acceptedSummary ?? run?.summaryDraft;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enrich lead"
      className="max-w-lg"
      footer={
        phase === "done" ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {blocked.length > 0 ? (
              <Button disabled={saving} loading={saving} onClick={() => void applyOverwrites()}>
                Replace CRM values
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {phase === "running" ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="enrich-orb" aria-hidden />
          <p className="mt-5 text-[15px] font-medium text-[var(--color-ink)]">
            {PROGRESS_STEPS[progressIndex]}
          </p>
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-muted)] max-w-sm">
            Public-web search uses name and email only. CRM-entered values are never overwritten
            silently.
          </p>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="space-y-3">
          {error ? (
            <p className="text-[13px] text-[var(--color-danger-fg)]">{error}</p>
          ) : null}
          {run?.demoMode ? (
            <p className="rounded-md bg-[var(--color-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--color-warn-fg)]">
              Dry-run / demo fixture. No live web search was sent.
            </p>
          ) : null}
          {run?.status === "ambiguous" || run?.identityMatch === "ambiguous" ? (
            <p className="text-[13px] text-[var(--color-ink)]">
              {run.identityRationale ||
                run.failureMessage ||
                "Identity is ambiguous. No enrichment result."}
            </p>
          ) : null}
          {run?.status === "failed" ? (
            <p className="text-[13px] text-[var(--color-danger-fg)]">
              {run.failureMessage || "No unique public professional identity matched."}
            </p>
          ) : null}
          {run && run.status !== "ambiguous" && run.status !== "failed" && !error ? (
            <p className="text-[13px] text-[var(--color-ink)]">
              Safe public professional fields are now on the profile. Review badges, sources, and
              the “what we know” note. You can edit, clear, or revert the entire run.
            </p>
          ) : null}
          {summary?.text ? (
            <div className="rounded-lg border border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/40 p-3">
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-enrich-fg)] font-semibold mb-1">
                What we know
              </p>
              <p className="text-[13px] text-[var(--color-ink-soft)]">{summary.text}</p>
            </div>
          ) : null}
          {blocked.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                These CRM-entered values were kept. Replace only if you intend to overwrite them.
              </p>
              {blocked.map((item) => (
                <p key={item.id} className="text-[13px]">
                  {LEAD_ENRICHMENT_FIELD_LABELS[item.fieldKey]}: {item.currentValue} →{" "}
                  {item.proposedValue}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
