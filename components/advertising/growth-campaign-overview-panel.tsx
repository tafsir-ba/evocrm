"use client";

import { useCallback, useEffect, useState } from "react";

import { AdCopilotWhatToDoNext } from "@/components/advertising/ad-copilot-what-to-do-next";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AdCopilotFunnelCounts,
  AdCopilotNextStep,
} from "@/lib/ad-copilot-next-step";
import { formatApiErrorMessage } from "@/lib/format-api-error";
import { workspacePath } from "@/lib/workspace-paths";

type Overview = {
  pilot: {
    projectName: string;
    marketLabel: string;
  };
  growthCampaign: {
    id: string;
    name: string;
    attributionPolicyLabel: string;
    projectLockNotice?: string;
    trustedDestinationCount?: number;
  } | null;
  accounts: Array<{
    id: string;
    name: string;
    currency: string;
    freshnessLabel: string;
  }>;
  hierarchy: Array<{
    id: string;
    name: string;
    status: string;
    adGroups: Array<{
      id: string;
      name: string;
      status: string;
      ads: Array<{ id: string; name: string; status: string }>;
    }>;
  }>;
  outcomes?: {
    attributionLabel: string;
    formLeads: number;
    qualifiedLeads: number;
    opportunities: number;
    wonCount: number;
    wonValue: number;
    pipelineValue: number;
    costPerFormLead: number | null;
    costPerQualifiedLead: number | null;
    roas: number | null;
    freshnessLabel: string;
    excludedTestLeads?: number;
    exclusionNotice?: string | null;
  };
  analytics: {
    metricTierLabel: string;
    spend: number;
    clicks: number;
    freshnessLabel: string;
  };
  /** Present on current overview responses; omit Action Center if missing. */
  funnel?: AdCopilotFunnelCounts | null;
  optimisation?: AdCopilotNextStep | null;
  nextStepHint: string;
  readOnly: boolean;
};

function hasWhatToDoNextPayload(
  overview: Overview,
): overview is Overview & {
  funnel: AdCopilotFunnelCounts;
  optimisation: AdCopilotNextStep;
} {
  return Boolean(
    overview.optimisation &&
      typeof overview.optimisation.title === "string" &&
      typeof overview.optimisation.whatNumbersSay === "string" &&
      typeof overview.optimisation.whyItMatters === "string" &&
      typeof overview.optimisation.manualNextStep === "string" &&
      typeof overview.optimisation.evidenceLabel === "string" &&
      typeof overview.optimisation.nextAction === "string" &&
      overview.funnel &&
      typeof overview.funnel.formLeads === "number",
  );
}

export function GrowthCampaignOverviewPanel({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/advertising/overview?projectId=${encodeURIComponent(projectId)}`,
      );
      const json = (await response.json()) as {
        data?: { overview: Overview };
        error?: { message?: string; details?: Record<string, unknown> };
      };
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(json, "Could not load paid ads overview."),
        );
      }
      setOverview(json.data?.overview ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load paid ads overview.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading paid ads overview">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not load paid ads" description={error} />;
  }

  if (!overview) {
    return (
      <EmptyState
        title="No paid ads overview"
        description="Ask an admin to connect Meta in Settings → Paid ads."
      />
    );
  }

  const outcomes = overview.outcomes;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
          Paid ads for {overview.pilot.projectName}
        </h2>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
          Pilot market: {overview.pilot.marketLabel}. View only — no publishing from here.
        </p>
      </div>

      {overview.growthCampaign?.projectLockNotice ? (
        <p className="text-[12.5px] rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[var(--color-ink)]">
          {overview.growthCampaign.projectLockNotice}
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold">Business results first</h3>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          {outcomes?.attributionLabel ??
            "Last touch — the most recent paid click gets the credit (v1)"}
          . Freshness: {outcomes?.freshnessLabel ?? overview.analytics.freshnessLabel}.
        </p>
        {outcomes?.exclusionNotice ? (
          <p
            className="text-[12.5px] text-[var(--color-ink-muted)]"
            data-testid="paid-ads-qa-exclusion-notice"
          >
            {outcomes.exclusionNotice}
          </p>
        ) : null}
        {outcomes &&
        outcomes.formLeads +
          outcomes.qualifiedLeads +
          outcomes.opportunities +
          outcomes.wonCount ===
          0 ? (
          <EmptyState
            title="No paid outcomes yet"
            description="When a lead arrives from the Satigny website with tracking, results will show here: form leads → qualified → opportunities → won."
          />
        ) : (
          <div className="rounded-xl border border-[var(--color-line)] bg-white p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Won value (ROAS)"
              value={
                outcomes
                  ? `${outcomes.wonValue.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}${
                      outcomes.roas != null
                        ? ` · ROAS ${outcomes.roas.toFixed(2)}`
                        : ""
                    }`
                  : "—"
              }
              help="Return on ad spend = won value ÷ spend. Shown when both exist."
            />
            <Stat
              label="Opportunities"
              value={String(outcomes?.opportunities ?? 0)}
              help={`Pipeline value: ${(outcomes?.pipelineValue ?? 0).toLocaleString()}`}
            />
            <Stat
              label="Qualified leads"
              value={String(outcomes?.qualifiedLeads ?? 0)}
              help={
                outcomes?.costPerQualifiedLead != null
                  ? `About ${outcomes.costPerQualifiedLead.toFixed(0)} spend per qualified lead`
                  : "Status “Qualified” on the lead"
              }
            />
            <Stat
              label="Form leads"
              value={String(outcomes?.formLeads ?? 0)}
              help={
                outcomes?.costPerFormLead != null
                  ? `About ${outcomes.costPerFormLead.toFixed(0)} spend per form lead`
                  : "Diagnostic only"
              }
            />
            <Stat
              label="Spend (recent snapshots)"
              value={overview.analytics.spend.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            />
            <Stat
              label="Clicks (media only)"
              value={String(overview.analytics.clicks)}
            />
          </div>
        )}
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          {overview.analytics.metricTierLabel}
        </p>
      </section>

      {hasWhatToDoNextPayload(overview) ? (
        <AdCopilotWhatToDoNext
          step={overview.optimisation}
          funnel={overview.funnel}
          settingsHref={workspacePath(workspaceSlug, "settings", "advertising")}
        />
      ) : null}

      {overview.growthCampaign ? (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Plan: <strong>{overview.growthCampaign.name}</strong> ·{" "}
          {overview.growthCampaign.attributionPolicyLabel}
        </p>
      ) : (
        <EmptyState
          title="Paid-ads plan not set up yet"
          description="Go to Settings → Paid ads and set up the Satigny plan, then refresh Meta."
        />
      )}

      <section>
        <h3 className="text-[14px] font-semibold mb-2">Ad accounts</h3>
        {overview.accounts.length === 0 ? (
          <EmptyState
            title="No ad accounts yet"
            description="Connect Meta and click Refresh now in Settings → Paid ads."
          />
        ) : (
          <ul className="space-y-2">
            {overview.accounts.map((account) => (
              <li
                key={account.id}
                className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-[13px]"
              >
                <strong>{account.name}</strong> · {account.currency} ·{" "}
                {account.freshnessLabel}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[14px] font-semibold mb-2">Campaigns → ad sets → ads</h3>
        {overview.hierarchy.length === 0 ? (
          <EmptyState
            title="No campaigns synced yet"
            description={overview.nextStepHint}
          />
        ) : (
          <ul className="space-y-3">
            {overview.hierarchy.map((campaign) => (
              <li
                key={campaign.id}
                className="rounded-xl border border-[var(--color-line)] bg-white p-3"
              >
                <p className="text-[13.5px] font-medium">
                  {campaign.name}{" "}
                  <span className="text-[var(--color-ink-muted)] font-normal">
                    ({campaign.status})
                  </span>
                </p>
                <ul className="mt-2 ml-3 space-y-2">
                  {campaign.adGroups.map((group) => (
                    <li key={group.id}>
                      <p className="text-[13px]">
                        Ad set: {group.name}{" "}
                        <span className="text-[var(--color-ink-muted)]">({group.status})</span>
                      </p>
                      <ul className="ml-3 mt-1 space-y-1">
                        {group.ads.map((ad) => (
                          <li key={ad.id} className="text-[12.5px] text-[var(--color-ink-muted)]">
                            Ad: {ad.name} ({ad.status})
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[12.5px] text-[var(--color-ink-muted)]">{overview.nextStepHint}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
        {label}
      </p>
      <p className="text-[15px] font-semibold text-[var(--color-ink)] mt-1">{value}</p>
      {help ? (
        <p className="text-[11.5px] text-[var(--color-ink-muted)] mt-1">{help}</p>
      ) : null}
    </div>
  );
}
