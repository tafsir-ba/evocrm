"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  LEAD_ENRICHMENT_ALLOWED_SOURCE_LABELS,
  LEAD_ENRICHMENT_ALLOWED_SOURCES,
  LEAD_ENRICHMENT_FIELD_LABELS,
  crmValueRequiresOverwrite,
  type LeadEnrichmentAllowedSource,
  type LeadEnrichmentSuggestion,
} from "@/lib/lead-enrichment";
import type { LeadFieldProvenanceMethod } from "@/lib/lead-intelligence";
import { FieldOriginBadge } from "@/components/leads/field-origin-badge";

type KnownLead = {
  fullName: string;
  email: string | null;
  company?: { name: string } | null;
  jobTitle?: string | null;
  industry?: string | null;
  stateRegion?: string | null;
  city?: string | null;
  country?: string | null;
  professionalProfileUrl?: string | null;
  intelligenceProvenance?: Partial<
    Record<string, { method: LeadFieldProvenanceMethod } | null>
  >;
};

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
  sources: Array<{ url: string; title: string }>;
  demoMode: boolean;
};

export function LeadEnrichmentModal({
  open,
  onClose,
  workspaceSlug,
  leadId,
  lead,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  leadId: string;
  lead: KnownLead;
  onApplied: () => void;
}) {
  const api = `/api/workspaces/${workspaceSlug}/leads/${leadId}/enrichment`;
  const [step, setStep] = useState<"sources" | "running" | "review">("sources");
  const [allowed, setAllowed] = useState<LeadEnrichmentAllowedSource[]>([
    "professional_directory",
    "company_website",
  ]);
  const [run, setRun] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [overwrites, setOverwrites] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [summaryEdit, setSummaryEdit] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("sources");
      setRun(null);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const knownRows = useMemo(
    () =>
      [
        ["Name", lead.fullName, null],
        ["Email", lead.email ?? "—", null],
        ["Company", lead.company?.name ?? "—", lead.intelligenceProvenance?.companyId?.method],
        ["Job title", lead.jobTitle ?? "—", lead.intelligenceProvenance?.jobTitle?.method],
        ["Industry", lead.industry ?? "—", lead.intelligenceProvenance?.industry?.method],
        ["Region", lead.stateRegion ?? "—", lead.intelligenceProvenance?.stateRegion?.method],
        ["City", lead.city ?? "—", lead.intelligenceProvenance?.city?.method],
        ["Country", lead.country ?? "—", lead.intelligenceProvenance?.country?.method],
      ] as Array<[string, string, LeadFieldProvenanceMethod | null | undefined]>,
    [lead],
  );

  async function runSearch() {
    setError(null);
    setStep("running");
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedSources: allowed }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Enrichment failed.");
      }
      const next = payload.data.run as RunPayload;
      setRun(next);
      setSummaryEdit(next.summaryDraft?.text ?? "");
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed.");
      setStep("sources");
    }
  }

  async function submitDecisions(actionForAll?: "accept" | "reject") {
    if (!run) return;
    setSaving(true);
    setError(null);
    try {
      const decisions = run.suggestions
        .filter((item) => item.status === "proposed")
        .map((item) => {
          if (actionForAll === "reject") {
            return { suggestionId: item.id, action: "reject" as const };
          }
          const edited = edits[item.id]?.trim();
          return {
            suggestionId: item.id,
            action: edited && edited !== item.proposedValue ? ("edit" as const) : ("accept" as const),
            editedValue: edited || undefined,
            overwriteAcknowledged: overwrites[item.id] === true,
          };
        });
      const response = await fetch(`${api}/${run.id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisions,
          summaryAction: actionForAll === "reject" ? "reject" : "accept",
          summaryEdit,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not save review.");
      }
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enrich lead"
      className="max-w-3xl"
      footer={
        step === "sources" ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void runSearch()} disabled={allowed.length === 0}>
              Run public search
            </Button>
          </div>
        ) : step === "review" ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {run?.status === "reviewing" ? (
              <>
                <Button variant="ghost" disabled={saving} onClick={() => void submitDecisions("reject")}>
                  Reject all
                </Button>
                <Button disabled={saving} loading={saving} onClick={() => void submitDecisions("accept")}>
                  Save accepted fields
                </Button>
              </>
            ) : null}
          </div>
        ) : null
      }
    >
      {error ? (
        <p className="mb-3 text-[13px] text-[var(--color-danger-fg)]">{error}</p>
      ) : null}

      {step === "sources" ? (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-ink-soft)]">
            Search uses the lead’s name and email only, after you start it. Results are proposals until
            you accept them. CRM-entered values are never overwritten silently.
          </p>
          <div className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)]">
            {knownRows.map(([label, value, method]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                    {label}
                  </p>
                  <p className="text-[13px] text-[var(--color-ink)]">{value}</p>
                </div>
                <FieldOriginBadge method={method} />
              </div>
            ))}
          </div>
          <fieldset>
            <legend className="text-[13px] font-medium text-[var(--color-ink)] mb-2">
              Allowed public sources
            </legend>
            <div className="space-y-2">
              {LEAD_ENRICHMENT_ALLOWED_SOURCES.map((source) => (
                <label key={source} className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowed.includes(source)}
                    onChange={(event) => {
                      setAllowed((current) =>
                        event.target.checked
                          ? [...current, source]
                          : current.filter((item) => item !== source),
                      );
                    }}
                  />
                  <span>{LEAD_ENRICHMENT_ALLOWED_SOURCE_LABELS[source]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      {step === "running" ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">
          Searching public sources and synthesizing cited results…
        </p>
      ) : null}

      {step === "review" && run ? (
        <div className="space-y-4">
          {run.demoMode ? (
            <p className="rounded-md bg-[var(--color-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--color-warn-fg)]">
              Dry-run / demo fixture. No live web search was sent.
            </p>
          ) : null}
          {run.status === "ambiguous" || run.identityMatch === "ambiguous" ? (
            <p className="text-[13px] text-[var(--color-ink)]">
              {run.identityRationale || run.failureMessage || "Identity is ambiguous. No result."}
            </p>
          ) : null}
          {run.status === "failed" ? (
            <p className="text-[13px] text-[var(--color-danger-fg)]">
              {run.failureMessage || "No unique public professional identity matched."}
            </p>
          ) : null}

          {run.suggestions.map((suggestion) => {
            const needsOverwrite = crmValueRequiresOverwrite(
              suggestion.currentValue,
              suggestion.currentOrigin,
            );
            return (
              <div
                key={suggestion.id}
                className="rounded-lg border border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {LEAD_ENRICHMENT_FIELD_LABELS[suggestion.fieldKey]}
                  </p>
                  <span className="text-[12px] text-[var(--color-enrich-fg)]">
                    {suggestion.confidencePercent}% confidence
                  </span>
                </div>
                <p className="text-[12px] text-[var(--color-ink-muted)]">
                  Current: {suggestion.currentValue ?? "—"}{" "}
                  <FieldOriginBadge method={suggestion.currentOrigin} />
                </p>
                <input
                  className="w-full rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[13px]"
                  defaultValue={suggestion.proposedValue}
                  onChange={(event) =>
                    setEdits((current) => ({ ...current, [suggestion.id]: event.target.value }))
                  }
                />
                <p className="text-[12.5px] text-[var(--color-ink-soft)]">{suggestion.rationale}</p>
                <p className="text-[11.5px] text-[var(--color-ink-muted)]">
                  {suggestion.searchProvider} · {suggestion.aiModel} · retrieved{" "}
                  {suggestion.retrievedAt}
                </p>
                <ul className="text-[12px]">
                  {suggestion.sourceUrls.map((url) => (
                    <li key={url}>
                      <a className="text-[var(--color-brand-700)] hover:underline" href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
                {needsOverwrite ? (
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={overwrites[suggestion.id] === true}
                      onChange={(event) =>
                        setOverwrites((current) => ({
                          ...current,
                          [suggestion.id]: event.target.checked,
                        }))
                      }
                    />
                    Overwrite CRM-entered value
                  </label>
                ) : null}
              </div>
            );
          })}

          {run.summaryDraft ? (
            <div className="rounded-lg border border-[var(--color-line)] p-3 space-y-2">
              <p className="text-[13px] font-semibold">Enrichment summary</p>
              <textarea
                className="w-full min-h-[88px] rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[13px]"
                value={summaryEdit}
                onChange={(event) => setSummaryEdit(event.target.value)}
              />
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                User-reviewed. Never auto-sent. Citations:{" "}
                {run.summaryDraft.citationUrls.join(", ") || "—"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
