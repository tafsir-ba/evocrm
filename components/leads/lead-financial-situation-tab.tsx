"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FINANCIAL_CONFIDENCE_LEVELS,
  FINANCIAL_EMPLOYMENT_TYPE_LABELS,
  FINANCIAL_EMPLOYMENT_TYPES,
  FINANCIAL_SITUATION_SOURCE_LABELS,
  FINANCIAL_SITUATION_SOURCES,
  MARKET_INCOME_DISCLAIMER,
  type LeadFinancialSituationSnapshot,
  type MarketIncomeEstimate,
} from "@/lib/lead-financial-situation";

type Payload = {
  snapshot: LeadFinancialSituationSnapshot;
  record: { marketIncomeEstimate: MarketIncomeEstimate | null; revisions: unknown[] } | null;
  disclaimer: string;
};

export function LeadFinancialSituationTab({
  workspaceSlug,
  leadId,
  canUpdate,
  canDelete,
}: {
  workspaceSlug: string;
  leadId: string;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const api = `/api/workspaces/${workspaceSlug}/leads/${leadId}/financial-situation`;
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<LeadFinancialSituationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(api);
    const payload = await response.json();
    if (response.status === 403) {
      setForbidden(true);
      return;
    }
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to load financial situation.");
      return;
    }
    const body = payload.data as Payload;
    setData(body);
    setForm(body.snapshot);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <p className="px-5 pb-5 text-[13px] text-[var(--color-ink-muted)]">
        Restricted. You do not have permission to view financial situation.
      </p>
    );
  }
  if (!form) {
    return (
      <p className="px-5 pb-5 text-[13px] text-[var(--color-ink-muted)]">
        {error ?? "Loading financial situation…"}
      </p>
    );
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Save failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function estimate() {
    setEstimating(true);
    setError(null);
    try {
      const response = await fetch(`${api}/market-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Estimate failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed.");
    } finally {
      setEstimating(false);
    }
  }

  const estimateRecord = data?.record?.marketIncomeEstimate ?? null;

  return (
    <div className="px-5 pb-5 space-y-4">
      <p className="text-[12.5px] text-[var(--color-ink-muted)]">
        Sensitive internal commercial/mortgage discovery. Not public-web enrichment. No automatic
        credit, mortgage, pricing, or eligibility decision.
      </p>
      {error ? <p className="text-[13px] text-[var(--color-danger-fg)]">{error}</p> : null}
      <p className="text-[13px] font-semibold text-[var(--color-ink)]">
        Declared figures (user-entered)
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fin-income">Declared annual income / revenue</Label>
          <Input
            id="fin-income"
            type="number"
            disabled={!canUpdate}
            value={form.declaredAnnualIncome ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                declaredAnnualIncome: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="fin-emp">Employment type</Label>
          <Select
            id="fin-emp"
            disabled={!canUpdate}
            value={form.employmentType ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                employmentType:
                  (event.target.value as typeof form.employmentType) || null,
              })
            }
          >
            <option value="">—</option>
            {FINANCIAL_EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {FINANCIAL_EMPLOYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fin-deposit">Available deposit / equity</Label>
          <Input
            id="fin-deposit"
            type="number"
            disabled={!canUpdate}
            value={form.availableDepositEquity ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                availableDepositEquity:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="fin-price">Target budget / purchase price</Label>
          <Input
            id="fin-price"
            type="number"
            disabled={!canUpdate}
            value={form.targetPurchasePrice ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                targetPurchasePrice: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="fin-need">Financing need</Label>
          <Input
            id="fin-need"
            type="number"
            disabled={!canUpdate}
            value={form.financingNeed ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                financingNeed: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="fin-currency">Currency</Label>
          <Input
            id="fin-currency"
            disabled={!canUpdate}
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
          />
        </div>
        <div>
          <Label htmlFor="fin-source">Source</Label>
          <Select
            id="fin-source"
            disabled={!canUpdate}
            value={form.source ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                source: (event.target.value as typeof form.source) || null,
              })
            }
          >
            <option value="">—</option>
            {FINANCIAL_SITUATION_SOURCES.map((source) => (
              <option key={source} value={source}>
                {FINANCIAL_SITUATION_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fin-asof">As-of date</Label>
          <Input
            id="fin-asof"
            type="date"
            disabled={!canUpdate}
            value={form.asOfDate ?? ""}
            onChange={(event) => setForm({ ...form, asOfDate: event.target.value || null })}
          />
        </div>
        <div>
          <Label htmlFor="fin-conf">Confidence</Label>
          <Select
            id="fin-conf"
            disabled={!canUpdate}
            value={form.confidence ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                confidence: (event.target.value as typeof form.confidence) || null,
              })
            }
          >
            <option value="">—</option>
            {FINANCIAL_CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="fin-commit">Existing commitments</Label>
        <Textarea
          id="fin-commit"
          disabled={!canUpdate}
          value={form.existingCommitments ?? ""}
          onChange={(event) => setForm({ ...form, existingCommitments: event.target.value || null })}
        />
      </div>
      <div>
        <Label htmlFor="fin-aff">Affordability notes</Label>
        <Textarea
          id="fin-aff"
          disabled={!canUpdate}
          value={form.affordabilityNotes ?? ""}
          onChange={(event) => setForm({ ...form, affordabilityNotes: event.target.value || null })}
        />
      </div>
      <div>
        <Label htmlFor="fin-assess">Internal assessor notes</Label>
        <Textarea
          id="fin-assess"
          disabled={!canUpdate}
          value={form.assessorNotes ?? ""}
          onChange={(event) => setForm({ ...form, assessorNotes: event.target.value || null })}
        />
      </div>
      {canUpdate ? (
        <Button onClick={() => void save()} loading={saving}>
          Save financial situation
        </Button>
      ) : null}

      <div className="rounded-lg border border-dashed border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/30 p-3 space-y-2">
        <p className="text-[13px] font-semibold text-[var(--color-enrich-fg)]">
          AI occupational estimate — not a declared figure
        </p>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">{MARKET_INCOME_DISCLAIMER}</p>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Enrich requests this after a unique match when job title and location are on the
          profile. It never writes into declared income, deposit, or budget fields.
        </p>
        {estimateRecord ? (
          <div className="text-[13px] space-y-1">
            {estimateRecord.demoMode || estimateRecord.searchProvider === "demo_fixture" ? (
              <p className="rounded-md bg-[var(--color-warn-bg)] px-2 py-1.5 text-[12.5px] text-[var(--color-warn-fg)]">
                Demo fixture occupational placeholder — not live market data and not this
                person’s income.
              </p>
            ) : null}
            <p>
              Range: {estimateRecord.rangeMin?.toLocaleString() ?? "—"} –{" "}
              {estimateRecord.rangeMax?.toLocaleString() ?? "—"} {estimateRecord.currency} (
              {estimateRecord.confidencePercent}% source confidence)
            </p>
            <p>{estimateRecord.methodology}</p>
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              Job {estimateRecord.jobTitleUsed} · {estimateRecord.locationUsed} ·{" "}
              {estimateRecord.searchProvider} / {estimateRecord.aiModel}
            </p>
            {estimateRecord.sources?.length ? (
              <ul className="text-[12px] space-y-0.5">
                {estimateRecord.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-[var(--color-brand-700)] hover:underline break-all"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[12px]">
              {estimateRecord.reviewed ? "Human-reviewed" : "Awaiting human review"}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-ink-muted)]">No estimate yet.</p>
        )}
        {canUpdate ? (
          <div className="flex gap-2">
            <Button variant="secondary" loading={estimating} onClick={() => void estimate()}>
              Request market-income estimate
            </Button>
            {estimateRecord && !estimateRecord.reviewed ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  await fetch(`${api}/market-estimate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ review: true }),
                  });
                  await load();
                }}
              >
                Mark reviewed
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `lead-${leadId}-financial-situation.json`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export financial data
        </Button>
        {canDelete ? (
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm("Delete financial situation data for this lead?")) return;
              await fetch(api, { method: "DELETE" });
              await load();
            }}
          >
            Delete financial data
          </Button>
        ) : null}
      </div>
    </div>
  );
}
