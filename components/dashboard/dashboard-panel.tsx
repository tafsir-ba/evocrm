"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { activityTypeIcon, formatActivityDateTime } from "@/components/activities/activity-helpers";
import { BarChart } from "@/components/domain/charts";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  closedPeriodSummary,
  defaultAttentionTab,
  rankProjectsForOperator,
  type DashboardAttentionTab,
  type DashboardProjectHealthItem,
} from "@/lib/dashboard-view";
import { formatInboundDemandLine } from "@/lib/inbound-received-at";
import { formatPrice } from "@/lib/format-price";
import { formatRelativeAge } from "@/lib/list-view";
import { appendProjectIdToSearchParams, withProjectIdQuery } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspaceHref, workspacePath } from "@/lib/workspace-paths";

type CurrencyAmount = { currency: string; amount: number };

type DashboardActivity = {
  id: string;
  title: string;
  dueDate: string | null;
  type: { label: string; key: string; color: string } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  relatedSummary: string | null;
};

type DashboardData = {
  summary: {
    dateRange: { from: string; to: string; timezone: string };
    metrics: {
      newLeads: number;
      activeOpportunities: number;
      wonOpportunities: number;
      lostOpportunities: number;
      activePipelineValue: CurrencyAmount[];
      wonValue: CurrencyAmount[];
      activitiesDueToday: number;
      overdueActivities: number;
    };
  };
  pipeline: {
    stages: Array<{
      status: { id: string; label: string; color: string; behavior?: string };
      count: number;
      valueByCurrency: CurrencyAmount[];
      includeInOverview: boolean;
    }>;
    activePipelineValue: CurrencyAmount[];
    totalCount: number;
  };
  activities: {
    upcoming: { items: DashboardActivity[] };
    overdue: { count: number; items?: DashboardActivity[] };
    dueToday: { count: number; items?: DashboardActivity[] };
  };
  sources: {
    sources: Array<{
      source: { id: string; label: string; color: string } | null;
      count: number;
    }>;
    total: number;
  };
  properties: {
    statuses: Array<{
      status: { id: string; label: string; color: string };
      count: number;
    }>;
    total: number;
  };
  recentOpportunities: Array<{
    id: string;
    leadName: string | null;
    propertyTitle: string | null;
    propertyReference: string | null;
    status: { label: string; color: string } | null;
    value: number | null;
    currency: string;
    updatedAt: string;
  }>;
};

type DatePreset = "7" | "30" | "90";

function formatCurrencyTotals(totals: CurrencyAmount[]): string {
  if (totals.length === 0) {
    return "—";
  }

  return totals.map((item) => formatPrice(item.amount, item.currency)).join(" · ");
}

function formatDateRangeLabel(from: string, to: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: fromDate.getFullYear() !== toDate.getFullYear() ? "numeric" : undefined,
  });
  return `${formatter.format(fromDate)} — ${formatter.format(toDate)}`;
}

function ownerName(user: { name: string | null; email: string } | null | undefined): string {
  return user?.name?.trim() || user?.email || "Unassigned";
}

type DashboardPanelProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
};

export function DashboardPanel({
  workspaceSlug,
  workspaceTimezone,
}: DashboardPanelProps) {
  const projectId = useWorkspaceProjectFilter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<DashboardProjectHealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("30");
  const [attentionTab, setAttentionTab] = useState<DashboardAttentionTab>("overdue");

  const scopedHref = useCallback(
    (segments: string | string[], query?: Record<string, string | number | null | undefined>) =>
      withProjectIdQuery(workspaceHref(workspaceSlug, segments, query), projectId),
    [projectId, workspaceSlug],
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({
        periodDays: datePreset,
        timezone: workspaceTimezone,
      });
      appendProjectIdToSearchParams(params, projectId);

      const [dashboardResponse, projectsResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/dashboard?${params.toString()}`),
        fetch(`/api/workspaces/${workspaceSlug}/projects?withCounts=true`),
      ]);

      if (dashboardResponse.status === 403) {
        setForbidden(true);
        return;
      }

      if (!dashboardResponse.ok) {
        throw new Error("Failed to load dashboard.");
      }

      const body = (await dashboardResponse.json()) as { data: DashboardData };
      setData(body.data);
      setAttentionTab(
        defaultAttentionTab({
          overdue: body.data.activities.overdue.count,
          dueToday: body.data.activities.dueToday.count,
        }),
      );

      if (projectsResponse.ok) {
        const projectsBody = (await projectsResponse.json()) as {
          data?: { projects?: DashboardProjectHealthItem[] };
        };
        setProjects(projectsBody.data?.projects ?? []);
      } else {
        setProjects([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [datePreset, projectId, workspaceSlug, workspaceTimezone]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = data?.summary.metrics;
  const dateRangeLabel = data
    ? formatDateRangeLabel(data.summary.dateRange.from, data.summary.dateRange.to)
    : "Last 30 days";

  const pipelineChartData = useMemo(
    () =>
      (data?.pipeline.stages ?? [])
        .filter((stage) => stage.includeInOverview && stage.count > 0)
        .map((stage) => ({
          stage: stage.status.label,
          count: stage.count,
        })),
    [data?.pipeline.stages],
  );

  const rankedProjects = useMemo(
    () => (projectId ? [] : rankProjectsForOperator(projects)),
    [projectId, projects],
  );

  const closed = metrics
    ? closedPeriodSummary(metrics.wonOpportunities, metrics.lostOpportunities)
    : null;

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view the dashboard."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load dashboard"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadDashboard() }}
      />
    );
  }

  const attentionItems =
    attentionTab === "overdue"
      ? (data?.activities.overdue.items ?? [])
      : attentionTab === "dueToday"
        ? (data?.activities.dueToday.items ?? [])
        : (data?.activities.upcoming.items ?? []);

  const attentionHref =
    attentionTab === "overdue"
      ? scopedHref("activities", { view: "overdue" })
      : scopedHref("activities", { view: "upcoming" });

  return (
    <>
      <PageHeader
        density="compact"
        title="Dashboard"
        meta={
          data ? (
            <span className="text-[12.5px] text-[var(--color-ink-muted)]">{dateRangeLabel}</span>
          ) : undefined
        }
        actions={
          <Select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            className="h-8 text-[13px]"
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Skeleton className="h-52 rounded-lg" />
            <Skeleton className="h-52 rounded-lg" />
          </div>
        </div>
      ) : data && metrics ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
            <StatLink
              href={scopedHref("leads", {
                createdFrom: data.summary.dateRange.from,
                createdTo: data.summary.dateRange.to,
              })}
              label="New leads"
              value={String(metrics.newLeads)}
              hint={dateRangeLabel}
            />
            <StatLink
              href={scopedHref("activities", { view: "overdue" })}
              label="Overdue"
              value={String(metrics.overdueActivities)}
              hint="Follow-ups past due"
              tone={metrics.overdueActivities > 0 ? "danger" : undefined}
            />
            <StatLink
              href={scopedHref("activities", { view: "upcoming" })}
              label="Due today"
              value={String(metrics.activitiesDueToday)}
              hint="Pending today"
            />
            <StatLink
              href={scopedHref("pipeline")}
              label="Open pipeline"
              value={String(metrics.activeOpportunities)}
              hint={formatCurrencyTotals(metrics.activePipelineValue)}
            />
            <StatLink
              href={scopedHref("pipeline")}
              label="Won"
              value={String(metrics.wonOpportunities)}
              hint={
                formatCurrencyTotals(metrics.wonValue) === "—"
                  ? dateRangeLabel
                  : formatCurrencyTotals(metrics.wonValue)
              }
            />
            <StatLink
              href={scopedHref("pipeline")}
              label="Lost"
              value={String(metrics.lostOpportunities)}
              hint={closed ? closed.wonShareLabel : dateRangeLabel}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
            <Card className="!p-3">
              <CardHeader
                density="compact"
                title="Needs attention"
                subtitle="Pending activities already returned by the workspace"
                action={
                  <Link
                    href={attentionHref}
                    className="text-[12px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    Open list
                  </Link>
                }
              />
              <div
                className="mb-2 inline-flex rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] p-0.5"
                role="tablist"
                aria-label="Follow-up queue"
              >
                {(
                  [
                    { key: "overdue", label: "Overdue", count: data.activities.overdue.count },
                    { key: "dueToday", label: "Today", count: data.activities.dueToday.count },
                    { key: "upcoming", label: "Upcoming", count: data.activities.upcoming.items.length },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={attentionTab === tab.key}
                    className={`h-7 rounded px-2 text-[12px] font-medium tabular ${
                      attentionTab === tab.key
                        ? "bg-white text-[var(--color-ink)] shadow-[var(--shadow-xs)]"
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                    onClick={() => setAttentionTab(tab.key)}
                  >
                    {tab.label} {tab.count}
                  </button>
                ))}
              </div>
              {attentionItems.length > 0 ? (
                <ul className="divide-y divide-[var(--color-line)]">
                  {attentionItems.map((activity) => (
                    <li key={activity.id}>
                      <Link
                        href={workspacePath(workspaceSlug, "activities", activity.id, "edit")}
                        className="flex items-center gap-2 py-1.5 hover:bg-[var(--color-canvas)]"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--color-brand-600)]">
                          {activityTypeIcon(activity.type?.key, 14)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-[var(--color-ink)]">
                            {activity.title}
                          </p>
                          <p className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
                            {[activity.relatedSummary, ownerName(activity.assignedUser)]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11.5px] tabular text-[var(--color-ink-soft)]">
                          {formatActivityDateTime(activity.dueDate, workspaceTimezone)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-[12.5px] text-[var(--color-ink-muted)]">
                  {attentionTab === "overdue"
                    ? "No overdue follow-ups."
                    : attentionTab === "dueToday"
                      ? "Nothing due today."
                      : "No upcoming activities."}
                </p>
              )}
            </Card>

            <Card className="!p-3">
              <CardHeader
                density="compact"
                title="Pipeline"
                subtitle={
                  closed
                    ? `${metrics.activeOpportunities} open · ${closed.won} won · ${closed.lost} lost`
                    : `${metrics.activeOpportunities} open · no closed deals in period`
                }
                action={
                  <Link
                    href={scopedHref("pipeline")}
                    className="text-[12px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    Board
                  </Link>
                }
              />
              {pipelineChartData.length > 0 ? (
                <BarChart data={pipelineChartData} />
              ) : (
                <p className="py-3 text-[12.5px] text-[var(--color-ink-muted)]">
                  No open opportunities to chart.
                </p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Card className="!p-3">
              <CardHeader
                density="compact"
                title="Lead sources"
                subtitle={`${data.sources.total} new leads · ${dateRangeLabel}`}
                action={
                  <Link
                    href={scopedHref("leads", {
                      createdFrom: data.summary.dateRange.from,
                      createdTo: data.summary.dateRange.to,
                    })}
                    className="text-[12px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    Leads
                  </Link>
                }
              />
              {data.sources.sources.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.sources.sources.map((item) => {
                    const label = item.source?.label ?? "No source";
                    const share =
                      data.sources.total > 0
                        ? Math.round((item.count / data.sources.total) * 100)
                        : 0;
                    return (
                      <li key={item.source?.id ?? "none"}>
                        <Link
                          href={scopedHref("leads", {
                            sourceId: item.source?.id,
                            createdFrom: data.summary.dateRange.from,
                            createdTo: data.summary.dateRange.to,
                          })}
                          className="flex items-center gap-2 text-[12.5px] hover:bg-[var(--color-canvas)]"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: item.source?.color ?? "#94A3B8" }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[var(--color-ink-soft)]">
                            {label}
                          </span>
                          <span className="tabular text-[var(--color-ink)]">{item.count}</span>
                          <span className="w-8 text-right tabular text-[var(--color-ink-muted)]">
                            {share}%
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-3 text-[12.5px] text-[var(--color-ink-muted)]">
                  No leads created in this period, so there is no source mix to show.
                </p>
              )}
            </Card>

            <Card className="!p-3">
              <CardHeader
                density="compact"
                title={projectId ? "This project" : "Project health"}
                subtitle="Active = genuine inbound lead in the last 30 days"
                action={
                  <Link
                    href={scopedHref("projects")}
                    className="text-[12px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    Projects
                  </Link>
                }
              />
              {rankedProjects.length > 0 ? (
                <ul className="divide-y divide-[var(--color-line)]">
                  {rankedProjects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={workspacePath(workspaceSlug, "projects", project.id)}
                        className="flex items-center gap-2 py-1.5 hover:bg-[var(--color-canvas)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-[var(--color-ink)]">
                            {project.name}
                            {project.reference ? (
                              <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
                                {project.reference}
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
                            {project.counts?.leads ?? 0} leads
                            {" · "}
                            {formatInboundDemandLine(
                              project.counts?.lastGenuineInboundAt,
                              project.counts?.lastGenuineInboundBasis,
                            )}
                          </p>
                        </div>
                        <Badge tone={project.status.tone} size="sm">
                          {project.status.label}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-[12.5px] text-[var(--color-ink-muted)]">
                  {projectId
                    ? "Project comparison is hidden while a single project filter is on."
                    : "No active projects with counts to review."}
                </p>
              )}
              {data.properties.total > 0 ? (
                <p className="mt-2 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                  Inventory{" "}
                  <Link href={scopedHref("properties")} className="hover:underline">
                    {data.properties.total} listings
                  </Link>
                  {data.properties.statuses
                    .filter((item) => item.count > 0)
                    .slice(0, 4)
                    .map((item) => ` · ${item.count} ${item.status.label.toLowerCase()}`)
                    .join("")}
                </p>
              ) : null}
            </Card>
          </div>

          <Card className="!p-3">
            <CardHeader
              density="compact"
              title="Recent opportunities"
              action={
                <Link
                  href={scopedHref("pipeline")}
                  className="text-[12px] font-medium text-[var(--color-brand-700)] hover:underline"
                >
                  Pipeline
                </Link>
              }
            />
            {data.recentOpportunities.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[12.5px] leading-none">
                  <thead className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                    <tr className="border-b border-[var(--color-line)]">
                      <th className="py-1 pr-2 text-left font-semibold">Opportunity</th>
                      <th className="px-2 py-1 text-left font-semibold">Stage</th>
                      <th className="px-2 py-1 text-left font-semibold">Value</th>
                      <th className="py-1 pl-2 text-left font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {data.recentOpportunities.map((opportunity) => (
                      <tr key={opportunity.id}>
                        <td className="py-1.5 pr-2">
                          <Link
                            href={workspacePath(workspaceSlug, "opportunities", opportunity.id)}
                            className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                          >
                            {opportunity.leadName ?? "—"}
                            {opportunity.propertyReference || opportunity.propertyTitle
                              ? ` · ${opportunity.propertyReference ?? opportunity.propertyTitle}`
                              : ""}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          {opportunity.status ? (
                            <StatusBadge
                              label={opportunity.status.label}
                              color={opportunity.status.color}
                              size="sm"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1.5 tabular">
                          {formatPrice(opportunity.value, opportunity.currency)}
                        </td>
                        <td className="py-1.5 pl-2 tabular text-[var(--color-ink-muted)]">
                          {formatRelativeAge(opportunity.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-3 text-[12.5px] text-[var(--color-ink-muted)]">
                No recent opportunities.
              </p>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}

function StatLink({
  href,
  label,
  value,
  hint,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  tone?: "danger";
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-2 hover:border-[var(--color-brand-300)] hover:bg-[var(--color-canvas)]"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[20px] font-bold tabular leading-none ${
          tone === "danger" ? "text-[var(--color-danger-fg)]" : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-[var(--color-ink-muted)]">{hint}</p>
    </Link>
  );
}
