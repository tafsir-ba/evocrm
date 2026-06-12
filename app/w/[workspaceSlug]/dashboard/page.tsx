import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Avatar, AvatarWithName } from "@/components/ui/avatar";
import { BarChart, DonutChart, MetricCard } from "@/components/domain/charts";
import {
  IconCalendar,
  IconChevronDown,
  IconClock,
  IconFilter,
  IconLeads,
  IconBuilding,
  IconBriefcase,
  IconSparkles,
} from "@/lib/icons";
import {
  activities,
  campaigns,
  dashboardMetrics,
  leadsBySource,
  opportunities,
  pipelineOverview,
} from "@/lib/mock-data";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Dashboard — EvoHome CRM" };

const METRIC_ICONS = [
  <IconLeads key="l" size={16} />,
  <IconBriefcase key="o" size={16} />,
  <IconSparkles key="w" size={16} />,
  <IconBuilding key="r" size={16} />,
];

export default async function DashboardPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const recent = opportunities.slice(0, 5);
  const upcoming = activities.filter((a) => a.status === "Upcoming").slice(0, 4);
  const campaignsList = campaigns.slice(0, 3);

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Live signal of leads, opportunities and follow-up across your workspace."
        actions={
          <>
            <button className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-white text-[13px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] focus-ring">
              <IconCalendar size={14} />
              May 1 — May 31, 2024
              <IconChevronDown size={13} />
            </button>
            <button className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-white text-[13px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] focus-ring">
              <IconFilter size={14} /> Filters
            </button>
          </>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {dashboardMetrics.map((m, i) => (
          <MetricCard
            key={m.key}
            label={m.label}
            value={m.value}
            delta={m.delta}
            hint={m.hint}
            icon={METRIC_ICONS[i]}
          />
        ))}
      </div>

      {/* Charts row */}
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
          <BarChart data={pipelineOverview} />
        </Card>
        <Card>
          <CardHeader
            title="Leads by source"
            subtitle="Last 30 days"
            action={
              <Link
                href={workspacePath(workspaceSlug, "leads")}
                className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              >
                See leads →
              </Link>
            }
          />
          <DonutChart data={leadsBySource} />
        </Card>
      </div>

      {/* Upcoming + Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Upcoming activities"
            subtitle="Next 7 days"
            action={
              <Link
                href={workspacePath(workspaceSlug, "activities")}
                className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              >
                View all
              </Link>
            }
          />
          <div className="divide-y divide-[var(--color-line)] -mx-5">
            {upcoming.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)] shrink-0">
                    <IconClock size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)] truncate">
                      {a.title}
                    </p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                      {a.related} · {a.type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[12.5px] text-[var(--color-ink-soft)] hidden sm:inline tabular">
                    {a.dueDate}
                  </span>
                  <Avatar user={a.assigned} size={22} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent campaigns"
            subtitle="Dripping"
            action={
              <Link
                href={workspacePath(workspaceSlug, "dripping")}
                className="text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              >
                All
              </Link>
            }
          />
          <div className="space-y-3">
            {campaignsList.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[var(--color-line)] p-3 hover:border-[var(--color-line-strong)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[13px] font-semibold text-[var(--color-ink)] truncate">
                    {c.name}
                  </p>
                  <StatusBadge status={c.status} size="sm" />
                </div>
                <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                  {c.enrolled} enrolled · {c.steps} steps
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent opportunities */}
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
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
                <th className="text-left font-medium px-5 py-2.5">Opportunity</th>
                <th className="text-left font-medium px-2 py-2.5">Stage</th>
                <th className="text-left font-medium px-2 py-2.5">Value</th>
                <th className="text-left font-medium px-2 py-2.5">Probability</th>
                <th className="text-left font-medium px-5 py-2.5">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {recent.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--color-canvas)]">
                  <td className="px-5 py-3">
                    <Link
                      href={workspacePath(workspaceSlug, "opportunities", o.id)}
                      className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                    >
                      {o.leadName} — {o.propertyName}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <Badge tone="info" size="sm">{o.stage}</Badge>
                  </td>
                  <td className="px-2 py-3 tabular text-[var(--color-ink)]">
                    {o.value}
                  </td>
                  <td className="px-2 py-3 tabular text-[var(--color-ink-soft)]">
                    {o.probability}%
                  </td>
                  <td className="px-5 py-3">
                    <AvatarWithName user={o.assigned} size={22} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}
