"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { activityTypeIcon, formatActivityDateTime } from "@/components/activities/activity-helpers";
import { BarChart, DonutChart, MetricCard } from "@/components/domain/charts";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format-price";
import {
  IconBriefcase,
  IconBuilding,
  IconLeads,
  IconSparkles,
} from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type CurrencyAmount = { currency: string; amount: number };

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
    upcoming: {
      items: Array<{
        id: string;
        title: string;
        dueDate: string | null;
        type: { label: string; key: string; color: string } | null;
        assignedUser: { id: string; name: string | null; email: string } | null;
        relatedSummary: string | null;
      }>;
    };
    overdue: { count: number };
    dueToday: { count: number };
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
    return "0";
  }

  return totals
    .map((item) => formatPrice(item.amount, item.currency))
    .join(" · ");
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

function getPresetDateRange(preset: DatePreset): { periodDays: string } {
  return { periodDays: preset };
}

type DashboardPanelProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
};

export function DashboardPanel({
  workspaceSlug,
  workspaceTimezone,
}: DashboardPanelProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("30");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const { periodDays } = getPresetDateRange(datePreset);
      const params = new URLSearchParams({
        periodDays,
        timezone: workspaceTimezone,
      });

      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/dashboard?${params.toString()}`,
      );

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load dashboard.");
      }

      const body = (await response.json()) as { data: DashboardData };
      setData(body.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [datePreset, workspaceSlug, workspaceTimezone]);

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
        .filter((stage) => stage.includeInOverview)
        .map((stage) => ({
          stage: stage.status.label,
          count: stage.count,
        })),
    [data?.pipeline.stages],
  );

  const hasPipelineData = (data?.pipeline.totalCount ?? 0) > 0;

  const sourcesChartData = useMemo(
    () =>
      (data?.sources.sources ?? []).map((item) => ({
        label: item.source?.label ?? "No source",
        value: item.count,
        color: item.source?.color ?? "#94A3B8",
      })),
    [data?.sources.sources],
  );

  const propertiesChartData = useMemo(
    () =>
      (data?.properties.statuses ?? []).map((item) => ({
        label: item.status.label,
        value: item.count,
        color: item.status.color,
      })),
    [data?.properties.statuses],
  );

  const metricCards = metrics
    ? [
        {
          key: "newLeads",
          label: "New leads",
          value: String(metrics.newLeads),
          hint: dateRangeLabel,
          icon: <IconLeads size={16} />,
        },
        {
          key: "activeOpportunities",
          label: "Active opportunities",
          value: String(metrics.activeOpportunities),
          hint: "Open pipeline",
          icon: <IconBriefcase size={16} />,
        },
        {
          key: "wonOpportunities",
          label: "Won opportunities",
          value: String(metrics.wonOpportunities),
          hint: dateRangeLabel,
          icon: <IconSparkles size={16} />,
        },
        {
          key: "overdueActivities",
          label: "Overdue activities",
          value: String(metrics.overdueActivities),
          hint: `${metrics.activitiesDueToday} due today`,
          icon: <IconBuilding size={16} />,
        },
      ]
    : [];

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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live signal of leads, opportunities and follow-up across your workspace."
        actions={
          <Select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
            className="h-9 text-[13px]"
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {metricCards.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
                icon={metric.icon}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader title="Active pipeline value" subtitle="Open opportunities only" />
              <p className="text-[22px] font-bold tabular text-[var(--color-ink)]">
                {formatCurrencyTotals(metrics?.activePipelineValue ?? [])}
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                Won value ({dateRangeLabel}):{" "}
                {formatCurrencyTotals(metrics?.wonValue ?? [])}
              </p>
            </Card>
            <Card>
              <CardHeader
                title="Pipeline health"
                subtitle={`${data.pipeline.totalCount} total opportunities`}
              />
              <p className="text-[22px] font-bold tabular text-[var(--color-ink)]">
                {metrics?.activeOpportunities ?? 0} active
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                {metrics?.wonOpportunities ?? 0} won · {metrics?.lostOpportunities ?? 0} lost
                in period
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader
                title="Pipeline overview"
                subtitle="Opportunity count by stage"
                action={
                  <Link
                    href={workspacePath(workspaceSlug, "pipeline")}
                    className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    Open pipeline →
                  </Link>
                }
              />
              {hasPipelineData ? (
                <BarChart data={pipelineChartData} />
              ) : (
                <EmptyState
                  title="No opportunities yet"
                  description="Create your first opportunity to see pipeline stages."
                />
              )}
            </Card>
            <Card>
              <CardHeader
                title="Leads by source"
                subtitle={dateRangeLabel}
                action={
                  <Link
                    href={workspacePath(workspaceSlug, "leads")}
                    className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    See leads →
                  </Link>
                }
              />
              {sourcesChartData.length > 0 ? (
                <DonutChart data={sourcesChartData} total={data.sources.total} />
              ) : (
                <EmptyState
                  title="No leads in this period"
                  description="Leads created in the selected date range will appear here."
                />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader title="Properties by status" subtitle="Current inventory" />
              {propertiesChartData.length > 0 ? (
                <DonutChart data={propertiesChartData} total={data.properties.total} />
              ) : (
                <EmptyState
                  title="No active properties"
                  description="Add properties to see status distribution."
                />
              )}
            </Card>
            <Card>
              <CardHeader
                title="Upcoming activities"
                subtitle={`${data.activities.dueToday.count} due today · ${data.activities.overdue.count} overdue`}
                action={
                  <Link
                    href={workspacePath(workspaceSlug, "activities")}
                    className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
                  >
                    View all
                  </Link>
                }
              />
              {data.activities.upcoming.items.length > 0 ? (
                <div className="divide-y divide-[var(--color-line)] -mx-5">
                  {data.activities.upcoming.items.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)] shrink-0">
                          {activityTypeIcon(activity.type?.key, 15)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-[var(--color-ink)] truncate">
                            {activity.title}
                          </p>
                          <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                            {activity.relatedSummary ?? "—"}
                            {activity.type ? ` · ${activity.type.label}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[12.5px] text-[var(--color-ink-soft)] hidden sm:inline tabular">
                          {formatActivityDateTime(activity.dueDate, workspaceTimezone)}
                        </span>
                        {activity.assignedUser ? (
                          <Avatar
                            user={{
                              id: activity.assignedUser.id,
                              name: activity.assignedUser.name ?? activity.assignedUser.email,
                              initials: (activity.assignedUser.name ?? activity.assignedUser.email)
                                .slice(0, 2)
                                .toUpperCase(),
                            }}
                            size={22}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No upcoming activities"
                  description="Pending activities with future due dates will appear here."
                />
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Recent opportunities"
              action={
                <Link
                  href={workspacePath(workspaceSlug, "pipeline")}
                  className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
                >
                  Go to pipeline
                </Link>
              }
            />
            {data.recentOpportunities.length > 0 ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead>
                    <tr className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
                      <th className="text-left font-medium px-5 py-2.5">Opportunity</th>
                      <th className="text-left font-medium px-2 py-2.5">Stage</th>
                      <th className="text-left font-medium px-2 py-2.5">Value</th>
                      <th className="text-left font-medium px-5 py-2.5">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {data.recentOpportunities.map((opportunity) => (
                      <tr key={opportunity.id} className="hover:bg-[var(--color-canvas)]">
                        <td className="px-5 py-3">
                          <Link
                            href={workspacePath(workspaceSlug, "opportunities", opportunity.id)}
                            className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                          >
                            {opportunity.leadName ?? "—"}
                            {opportunity.propertyTitle
                              ? ` — ${opportunity.propertyTitle}`
                              : ""}
                          </Link>
                        </td>
                        <td className="px-2 py-3">
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
                        <td className="px-2 py-3 tabular text-[var(--color-ink)]">
                          {formatPrice(opportunity.value, opportunity.currency)}
                        </td>
                        <td className="px-5 py-3 tabular text-[var(--color-ink-soft)]">
                          {formatActivityDateTime(opportunity.updatedAt, workspaceTimezone)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No opportunities yet"
                description="Recent opportunities will appear here as your pipeline grows."
              />
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
