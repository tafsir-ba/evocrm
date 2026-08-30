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
    lastActivityAt: string | null;
  };
};

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
        lastActivityAt: project.counts?.lastActivityAt,
        createdAt: project.createdAt,
        now,
      }),
    }))
    .sort((left, right) => {
      const staleRank = Number(right.status.label === "Stale") - Number(left.status.label === "Stale");
      if (staleRank !== 0) {
        return staleRank;
      }
      return (right.counts?.leads ?? 0) - (left.counts?.leads ?? 0);
    })
    .slice(0, 6);
}
