"use client";

import { useEffect, useRef, useState } from "react";

import { EnrichmentCandidateList } from "@/components/leads/lead-enrichment-candidates";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { LeadEnrichmentCandidate } from "@/lib/lead-enrichment";
import { isUniqueEnrichmentReveal, needsEnrichmentCandidateChoice } from "@/lib/lead-enrichment";

type RunPayload = {
  id: string;
  status: string;
  identityMatch: string | null;
  identityRationale: string | null;
  failureMessage: string | null;
  demoMode: boolean;
  candidates?: LeadEnrichmentCandidate[];
  selectedCandidateId?: string | null;
};

export type EnrichmentAppliedRun = {
  id: string;
  status: string;
  identityMatch: string | null;
  candidates?: LeadEnrichmentCandidate[];
  selectedCandidateId?: string | null;
};

const PROGRESS_STEPS = [
  "Searching public professional sources…",
  "Matching name and email to a unique identity…",
  "Synthesizing cited results…",
  "Filling safe profile fields…",
];

const REVEAL_CLOSE_MS = 560;

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
  onApplied: (run: EnrichmentAppliedRun) => void;
}) {
  const api = `/api/workspaces/${workspaceSlug}/leads/${leadId}/enrichment`;
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [progressIndex, setProgressIndex] = useState(0);
  const [run, setRun] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const onAppliedRef = useRef(onApplied);
  const onCloseRef = useRef(onClose);
  onAppliedRef.current = onApplied;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setPhase("running");
      setProgressIndex(0);
      setRun(null);
      setError(null);
      setSelectedCandidateId(null);
      setApplying(false);
      return;
    }

    let cancelled = false;
    let closeTimer: number | undefined;
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
        setSelectedCandidateId(next.candidates?.find((candidate) => candidate.mostLikely)?.id ?? next.candidates?.[0]?.id ?? null);
        setPhase("done");
        if (isUniqueEnrichmentReveal(next)) {
          onAppliedRef.current({
            id: next.id,
            status: next.status,
            identityMatch: next.identityMatch,
            candidates: next.candidates,
            selectedCandidateId: next.selectedCandidateId,
          });
          closeTimer = window.setTimeout(() => {
            if (!cancelled) {
              onCloseRef.current();
            }
          }, REVEAL_CLOSE_MS);
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
      if (closeTimer !== undefined) {
        window.clearTimeout(closeTimer);
      }
    };
  }, [open, api]);

  const uniqueReveal = Boolean(run && !error && isUniqueEnrichmentReveal(run));
  const choosing = Boolean(run && !error && needsEnrichmentCandidateChoice(run));

  async function applySelectedCandidate() {
    if (!run || !selectedCandidateId) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const response = await fetch(`${api}/${run.id}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedCandidateId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not apply that match.");
      }
      const next = payload.data.run as RunPayload;
      setRun(next);
      onAppliedRef.current({
        id: next.id,
        status: next.status,
        identityMatch: next.identityMatch,
        candidates: next.candidates,
        selectedCandidateId: next.selectedCandidateId,
      });
      onCloseRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply that match.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enrich lead"
      className="max-w-lg"
      footer={
        phase === "done" && !uniqueReveal ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {choosing ? (
              <Button
                onClick={() => void applySelectedCandidate()}
                disabled={!selectedCandidateId || applying}
              >
                {applying ? "Applying…" : "Apply this person"}
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
            silently. The profile fills in one step.
          </p>
        </div>
      ) : null}

      {phase === "done" && uniqueReveal ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="enrich-orb enrich-orb-done" aria-hidden />
          <p className="mt-5 text-[15px] font-medium text-[var(--color-ink)]">Profile filled</p>
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-muted)] max-w-sm">
            Safe public professional fields, the “what we know” note, and sources are on the lead.
            You can edit, clear, or revert from the profile.
          </p>
          {run?.demoMode ? (
            <p className="mt-3 rounded-md bg-[var(--color-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--color-warn-fg)]">
              Dry-run / demo fixture. No live web search was sent.
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "done" && !uniqueReveal ? (
        <div className="space-y-3">
          {error ? (
            <p className="text-[13px] text-[var(--color-danger-fg)]">{error}</p>
          ) : null}
          {run?.demoMode ? (
            <p className="rounded-md bg-[var(--color-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--color-warn-fg)]">
              Dry-run / demo fixture. No live web search was sent.
            </p>
          ) : null}
          {choosing ? (
            <>
              <p className="text-[13px] text-[var(--color-ink)]">
                {run?.identityRationale ||
                  "Several public professionals match. The first is the most likely — pick another if that is the wrong person."}
              </p>
              <EnrichmentCandidateList
                candidates={run?.candidates ?? []}
                selectedId={selectedCandidateId}
                onSelect={setSelectedCandidateId}
                disabled={applying}
              />
            </>
          ) : null}
          {!choosing && (run?.status === "ambiguous" || run?.identityMatch === "ambiguous") ? (
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
          {!run && !error ? (
            <p className="text-[13px] text-[var(--color-ink-muted)]">No enrichment result.</p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
