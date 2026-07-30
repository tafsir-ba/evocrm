"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BarChart, MetricCard } from "@/components/domain/charts";
import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAlert, IconChevronLeft, IconChart } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";
import type { CampaignAnalyticsPeriodPreset } from "@/lib/campaign-analytics";

type AnalyticsReport = {
  campaign: { id: string; name: string; status: string; createdAt: string };
  period: {
    preset: string;
    from: string;
    to: string;
  };
  analyticsAvailableFrom: string;
  trackingConfigured: boolean;
  partialHistory: boolean;
  generatedAt: string;
  health: {
    status: "healthy" | "needs_attention" | "critical" | "insufficient_data";
    label: string;
    reasons: string[];
  };
  summary: {
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
    complained: number;
    delayed: number;
    pending: number;
    failed: number;
    clickToOpenRate: number | null;
  };
  cards: Array<{
    key: string;
    label: string;
    value: string;
    count: number;
    denominator: number | null;
    rate: number | null;
    hint: string;
    warning?: boolean;
    critical?: boolean;
    rateDelta?: number | null;
  }>;
  funnel: Array<{
    stage: string;
    count: number;
    fromPreviousRate: number | null;
    ofSentRate: number | null;
  }>;
  series: Array<{
    date: string;
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    clicked: number;
    complained: number;
  }>;
  steps: Array<{
    stepId: string;
    order: number;
    name: string | null;
    subject: string;
    sent: number;
    delivered: number;
    deliveryRate: number | null;
    opened: number;
    openRate: number | null;
    clicked: number;
    clickRate: number | null;
    bounced: number;
    bounceRate: number | null;
    unsubscribed: number;
    complained: number;
    lastSentAt: string | null;
  }>;
  formulas: Record<string, string>;
};

type AnalyticsIssue = {
  id: string;
  leadName: string | null;
  emailMasked: string | null;
  stepOrder: number | null;
  stepSubject: string | null;
  issueType: "bounced" | "failed" | "complained" | "delayed";
  reason: string | null;
  eventAt: string;
};

const HEALTH_TONE: Record<
  AnalyticsReport["health"]["status"],
  "success" | "warn" | "danger" | "muted"
> = {
  healthy: "success",
  needs_attention: "warn",
  critical: "danger",
  insufficient_data: "muted",
};

type Props = {
  workspaceSlug: string;
  campaignId: string;
};

export function CampaignAnalyticsPanel({ workspaceSlug, campaignId }: Props) {
  const [period, setPeriod] = useState<CampaignAnalyticsPeriodPreset>("30d");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [issues, setIssues] = useState<AnalyticsIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [seriesMode, setSeriesMode] = useState<"delivery" | "engagement">("delivery");

  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}/analytics`;
  const campaignPath = workspacePath(workspaceSlug, `dripping/${campaignId}`);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const [reportRes, issuesRes] = await Promise.all([
        fetch(`${apiBase}?period=${period}`),
        fetch(`${apiBase}/issues?period=${period}&pageSize=25`),
      ]);

      if (reportRes.status === 403) {
        setForbidden(true);
        return;
      }

      const reportPayload = await reportRes.json();
      if (!reportRes.ok) {
        setError(reportPayload.error?.message ?? "Failed to load analytics.");
        return;
      }

      setReport(reportPayload.data);

      if (issuesRes.ok) {
        const issuesPayload = await issuesRes.json();
        setIssues(issuesPayload.data ?? []);
      } else {
        setIssues([]);
      }
    } catch {
      setError("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const seriesChartData = useMemo(() => {
    if (!report) return [];
    return report.series.map((point) => ({
      stage: point.date,
      count:
        seriesMode === "delivery"
          ? point.delivered
          : point.opened + point.clicked,
    }));
  }, [report, seriesMode]);

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view campaign analytics."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load analytics"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void load() }}
      />
    );
  }

  if (!report) {
    return null;
  }

  const noSends = report.summary.sent === 0;

  return (
    <>
      <div className="mb-4">
        <Link
          href={campaignPath}
          className="text-[13px] text-[var(--color-brand-700)] inline-flex items-center gap-1 hover:underline"
        >
          <IconChevronLeft size={14} /> Back to campaign
        </Link>
      </div>

      <PageHeader
        title={`Analytics — ${report.campaign.name}`}
        description="Monitor delivery health and recipient engagement across this campaign."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.campaign.status} size="sm" />
            <Badge tone={HEALTH_TONE[report.health.status]} size="sm">
              {report.health.label}
            </Badge>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Reporting period"
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value as CampaignAnalyticsPeriodPreset)
              }
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </Select>
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <p className="text-[12.5px] text-[var(--color-ink-muted)] mb-4">
        Period {new Date(report.period.from).toLocaleDateString()} –{" "}
        {new Date(report.period.to).toLocaleDateString()} · Updated{" "}
        {new Date(report.generatedAt).toLocaleString()}
      </p>

      {report.partialHistory ? (
        <Card className="mb-4 !p-4 border-[var(--color-warn-border)] bg-[var(--color-warn-bg)]">
          <p className="text-[13px] text-[var(--color-warn-fg)]">
            Analytics are available for emails sent after{" "}
            {new Date(report.analyticsAvailableFrom).toLocaleDateString()}. Earlier
            sends are not reconstructed.
          </p>
        </Card>
      ) : null}

      {!report.trackingConfigured ? (
        <Card className="mb-4 !p-4 border-[var(--color-warn-border)] bg-[var(--color-warn-bg)]">
          <p className="text-[13px] text-[var(--color-warn-fg)]">
            Delivery analytics may be incomplete because Resend webhook tracking
            (`RESEND_WEBHOOK_SECRET`) is not configured in this environment.
          </p>
        </Card>
      ) : null}

      <Card className="mb-6 !p-5">
        <div className="flex items-start gap-3">
          <IconAlert size={18} className="mt-0.5 text-[var(--color-ink-muted)]" />
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-ink)]">
              Campaign health — {report.health.label}
            </p>
            <ul className="mt-2 space-y-1">
              {report.health.reasons.map((reason) => (
                <li
                  key={reason}
                  className="text-[13px] text-[var(--color-ink-soft)]"
                >
                  {reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
              Health reflects delivery, bounces, complaints, and failures — not open
              or click engagement.
            </p>
          </div>
        </div>
      </Card>

      {noSends ? (
        <EmptyState
          title="No emails sent in this period"
          description="This campaign has not sent any emails in the selected period."
          primaryAction={{
            label: "Back to campaign",
            onClick: () => {
              window.location.href = campaignPath;
            },
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {report.cards.map((card) => (
              <div
                key={card.key}
                className={
                  card.critical
                    ? "rounded-xl ring-2 ring-[var(--color-danger-border)]"
                    : card.warning
                      ? "rounded-xl ring-2 ring-[var(--color-warn-border)]"
                      : undefined
                }
              >
                <MetricCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  delta={card.rateDelta ?? undefined}
                  icon={card.key === "sent" ? <IconChart size={16} /> : undefined}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <Card className="!p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">
                  Performance over time
                </h2>
                <Select
                  aria-label="Chart series"
                  value={seriesMode}
                  onChange={(event) =>
                    setSeriesMode(event.target.value as "delivery" | "engagement")
                  }
                >
                  <option value="delivery">Delivered</option>
                  <option value="engagement">Opened + clicked</option>
                </Select>
              </div>
              {seriesChartData.length === 0 ? (
                <p className="text-[13px] text-[var(--color-ink-muted)]">
                  No time-series points for this period.
                </p>
              ) : (
                <>
                  <BarChart data={seriesChartData} />
                  <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
                    Showing{" "}
                    {seriesMode === "delivery"
                      ? "delivered emails"
                      : "unique opens plus unique clicks"}{" "}
                    by{" "}
                    {report.series[0]?.date.includes("W") ? "week" : "day"}.
                  </p>
                </>
              )}
            </Card>

            <Card className="!p-5">
              <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">
                Campaign funnel
              </h2>
              <BarChart
                data={report.funnel.map((stage) => ({
                  stage: stage.stage,
                  count: stage.count,
                }))}
              />
              <ul className="mt-4 space-y-1 text-[12.5px] text-[var(--color-ink-muted)]">
                {report.funnel.map((stage) => (
                  <li key={stage.stage}>
                    {stage.stage}: {stage.count}
                    {stage.fromPreviousRate !== null
                      ? ` · ${stage.fromPreviousRate}% from previous stage`
                      : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
                Clicks can appear without a recorded open. Click-to-open rate:{" "}
                {report.summary.clickToOpenRate === null
                  ? "—"
                  : `${report.summary.clickToOpenRate}%`}
                .
              </p>
            </Card>
          </div>

          <Card className="!p-5 mb-6 overflow-x-auto">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">
              Performance by email step
            </h2>
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
                  <th className="py-2 pr-3 font-medium">Step</th>
                  <th className="py-2 pr-3 font-medium">Subject</th>
                  <th className="py-2 pr-3 font-medium">Sent</th>
                  <th className="py-2 pr-3 font-medium">Delivered</th>
                  <th className="py-2 pr-3 font-medium">Opens</th>
                  <th className="py-2 pr-3 font-medium">Clicks</th>
                  <th className="py-2 pr-3 font-medium">Bounces</th>
                  <th className="py-2 pr-3 font-medium">Unsub</th>
                  <th className="py-2 font-medium">Complaints</th>
                </tr>
              </thead>
              <tbody>
                {report.steps.map((step) => (
                  <tr
                    key={step.stepId}
                    className="border-b border-[var(--color-line)] text-[var(--color-ink)]"
                  >
                    <td className="py-2.5 pr-3">{step.order}</td>
                    <td className="py-2.5 pr-3 max-w-[220px] truncate">
                      {step.subject || step.name || "—"}
                    </td>
                    <td className="py-2.5 pr-3 tabular">{step.sent}</td>
                    <td className="py-2.5 pr-3 tabular">
                      {step.delivered}
                      {step.deliveryRate !== null ? ` (${step.deliveryRate}%)` : ""}
                    </td>
                    <td className="py-2.5 pr-3 tabular">
                      {step.opened}
                      {step.openRate !== null ? ` (${step.openRate}%)` : ""}
                    </td>
                    <td className="py-2.5 pr-3 tabular">
                      {step.clicked}
                      {step.clickRate !== null ? ` (${step.clickRate}%)` : ""}
                    </td>
                    <td
                      className={`py-2.5 pr-3 tabular ${
                        (step.bounceRate ?? 0) >= 5
                          ? "text-[var(--color-danger-fg)] font-semibold"
                          : (step.bounceRate ?? 0) >= 2
                            ? "text-[var(--color-warn-fg)] font-medium"
                            : ""
                      }`}
                    >
                      {step.bounced}
                      {step.bounceRate !== null ? ` (${step.bounceRate}%)` : ""}
                    </td>
                    <td className="py-2.5 pr-3 tabular">{step.unsubscribed}</td>
                    <td
                      className={`py-2.5 tabular ${
                        step.complained > 0
                          ? "text-[var(--color-danger-fg)] font-semibold"
                          : ""
                      }`}
                    >
                      {step.complained}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="!p-5 mb-6 overflow-x-auto">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-1">
              Delivery issues
            </h2>
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mb-4">
              Bounces, failures, complaints, and delayed messages in this period.
              Hard-bounced and complained addresses are suppressed from future sends.
            </p>
            {issues.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ink-muted)]">
                No delivery issues recorded for this period.
              </p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
                    <th className="py-2 pr-3 font-medium">Contact</th>
                    <th className="py-2 pr-3 font-medium">Step</th>
                    <th className="py-2 pr-3 font-medium">Issue</th>
                    <th className="py-2 pr-3 font-medium">Reason</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr
                      key={issue.id}
                      className="border-b border-[var(--color-line)] text-[var(--color-ink)]"
                    >
                      <td className="py-2.5 pr-3">
                        <div>{issue.leadName ?? "Unknown"}</div>
                        <div className="text-[var(--color-ink-faint)]">
                          {issue.emailMasked ?? "—"}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {issue.stepOrder ? `Step ${issue.stepOrder}` : "—"}
                        {issue.stepSubject ? ` · ${issue.stepSubject}` : ""}
                      </td>
                      <td className="py-2.5 pr-3 capitalize">{issue.issueType}</td>
                      <td className="py-2.5 pr-3">{issue.reason ?? "—"}</td>
                      <td className="py-2.5">
                        {new Date(issue.eventAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="!p-4">
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              Formulas: {report.formulas.deliveryRate}; {report.formulas.openRate};{" "}
              {report.formulas.clickRate}. Open tracking is approximate because image
              blocking and privacy features can hide opens.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
