import type { InboundReceivedBasis } from "@/lib/inbound-received-at";
import { projectListStatus, type ProjectListStatus } from "@/lib/projects-table";

export type DashboardAttentionTab = "overdue" | "dueToday" | "upcoming";

export type DashboardProjectHealthItem = {
  id: string;
  name: string;
  reference: string | null;
  archivedAt: string | null;
  createdAt: string;
  counts?: {
    leads: number;
    lastActivityAt?: string | null;
    lastGenuineInboundAt?: string | null;
    lastGenuineInboundBasis?: InboundReceivedBasis | null;
  };
};

function demandAttentionRank(label: ProjectListStatus["label"]): number {
  if (label === "Stale") {
    return 2;
  }
  if (label === "Unknown") {
    return 1;
  }
  return 0;
}

export function defaultAttentionTab(input: {
  overdue: number;
  dueToday: number;
}): DashboardAttentionTab {
  if (input.overdue > 0) {
    return "overdue";
  }
  if (input.dueToday > 0) {
    return "dueToday";
  }
  return "upcoming";
}

export function closedPeriodSummary(
  won: number,
  lost: number,
): { won: number; lost: number; closed: number; wonShareLabel: string } | null {
  const closed = won + lost;
  if (closed <= 0) {
    return null;
  }

  return {
    won,
    lost,
    closed,
    wonShareLabel: `${Math.round((won / closed) * 100)}% won of closed`,
  };
}

export function rankProjectsForOperator(
  projects: DashboardProjectHealthItem[],
  now?: Date,
): Array<DashboardProjectHealthItem & { status: ProjectListStatus }> {
  return projects
    .filter((project) => !project.archivedAt)
    .map((project) => ({
      ...project,
      status: projectListStatus({
        archivedAt: project.archivedAt,
        lastGenuineInboundAt: project.counts?.lastGenuineInboundAt,
        now,
      }),
    }))
    .sort((left, right) => {
      const rank = demandAttentionRank(right.status.label) - demandAttentionRank(left.status.label);
      if (rank !== 0) {
        return rank;
      }
      return (right.counts?.leads ?? 0) - (left.counts?.leads ?? 0);
    })
    .slice(0, 6);
}

export function formatCmpReconciliationSummary(input: {
  sourceCohortCount: number;
  membershipCount: number;
  overlapCount: number;
  sourceOnlyCount: number;
  membershipOnlyCount: number;
  cmpProjectCount: number;
}): string {
  if (input.cmpProjectCount === 0 && input.sourceCohortCount === 0) {
    return "No CRM CMP project and no CMP source-cohort leads stored yet.";
  }
  if (input.cmpProjectCount === 0) {
    return `${input.sourceCohortCount} CMP source-cohort leads, 0 CRM CMP project memberships. HubSpot CMP was not migrated onto a CMP project.`;
  }
  return `${input.overlapCount} in both · ${input.sourceOnlyCount} source only · ${input.membershipOnlyCount} membership only`;
}
