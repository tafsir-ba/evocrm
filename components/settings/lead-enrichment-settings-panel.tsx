"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type Settings = {
  enabled: boolean;
  demoMode: boolean;
  retentionDays: number;
  openaiConfigured: boolean;
  searchConfigured: boolean;
  tavilyConfigured: boolean;
  searchProvider: "tavily" | "brave" | "openai_web_search" | "none";
  usable: boolean;
  reasonDisabled: string | null;
  legalReviewAcknowledgedAt: string | null;
};

export function LeadEnrichmentSettingsPanel({
  workspaceSlug,
  canUpdate,
}: {
  workspaceSlug: string;
  canUpdate: boolean;
}) {
  const api = `/api/workspaces/${workspaceSlug}/settings/lead-enrichment`;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(api);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to load enrichment settings.");
      return;
    }
    setSettings(payload.data.settings as Settings);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) {
    return <p className="text-[13px] text-[var(--color-ink-muted)]">{error ?? "Loading…"}</p>;
  }

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Save failed.");
      }
      setSettings(payload.data.settings as Settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[15px] font-semibold mb-1">Lead enrichment</h2>
      <p className="text-[12.5px] text-[var(--color-ink-muted)] mb-4">
        Manual public-web research. Live Enrich needs OPENAI_API_KEY (synthesis) and a search
        key — Tavily first, then Brave, then OpenAI web search. Set TAVILY_API_KEY on the
        server (DigitalOcean env). Uncheck dry-run below or Tavily is never called. Policy:
        docs/lead-enrichment.md.
      </p>
      {error ? <p className="text-[13px] text-[var(--color-danger-fg)] mb-3">{error}</p> : null}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px] mb-4">
        <div>
          <dt className="text-[var(--color-ink-muted)]">OpenAI key</dt>
          <dd>{settings.openaiConfigured ? "Configured" : "Missing"}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-muted)]">Tavily search</dt>
          <dd>
            {settings.tavilyConfigured
              ? settings.demoMode
                ? "Key present — dry-run is on, so it is not used"
                : "Live (first provider)"
              : "Missing TAVILY_API_KEY"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-muted)]">Active search</dt>
          <dd>
            {settings.demoMode
              ? "Demo fixture"
              : settings.searchProvider === "none"
                ? "None"
                : settings.searchProvider}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-muted)]">Usable now</dt>
          <dd>{settings.usable ? "Yes" : settings.reasonDisabled ?? "No"}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-muted)]">Legal/privacy checkpoint</dt>
          <dd>
            {settings.legalReviewAcknowledgedAt
              ? `Acknowledged ${settings.legalReviewAcknowledgedAt.slice(0, 10)}`
              : "Not acknowledged"}
          </dd>
        </div>
      </dl>
      <label className="flex items-center gap-2 text-[13px] mb-3">
        <input
          type="checkbox"
          checked={settings.demoMode}
          disabled={!canUpdate}
          onChange={(event) => void save({ demoMode: event.target.checked })}
        />
        Dry-run / demo fixture (no live provider calls)
      </label>
      <div className="mb-3 max-w-xs">
        <Label htmlFor="retention">Retention days</Label>
        <Input
          id="retention"
          type="number"
          disabled={!canUpdate}
          defaultValue={settings.retentionDays}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (value && value !== settings.retentionDays) {
              void save({ retentionDays: value });
            }
          }}
        />
      </div>
      <label className="flex items-start gap-2 text-[13px] mb-4">
        <input type="checkbox" checked={ack || Boolean(settings.legalReviewAcknowledgedAt)} disabled={!canUpdate || Boolean(settings.legalReviewAcknowledgedAt)} onChange={(event) => setAck(event.target.checked)} />
        <span>
          I acknowledge the inclusion/exclusion policy: public professional information only;
          no minors, health, credentials, home addresses, or unverified allegations. Confidence is
          not a truth claim.
        </span>
      </label>
      {canUpdate ? (
        <Button
          loading={saving}
          onClick={() =>
            void save({
              enabled: !settings.enabled,
              ...(ack && !settings.legalReviewAcknowledgedAt
                ? { acknowledgeLegalReview: true }
                : {}),
            })
          }
        >
          {settings.enabled ? "Disable enrichment" : "Enable enrichment"}
        </Button>
      ) : null}
    </Card>
  );
}
