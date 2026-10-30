import "server-only";

import {
  mapLeadStatusesToFunnel,
  type MappedFunnelStatus,
} from "@/lib/lead-funnel-mapping";
import {
  buildFunnelBenchmarkDeltas,
  buildLeadFunnel,
  formatBenchmarkSummary,
  selectBenchmarkPeers,
  type BuiltLeadFunnel,
  type FunnelBenchmarkDelta,
  type LeadFunnelDateRange,
  type ProjectFunnelSnapshot,
} from "@/lib/lead-funnel-metrics";
import {
  groupProjectLeadsByStatus,
  groupWorkspaceLeadsByProjectAndStatus,
} from "@/server/repositories/leads";
import { findProjects } from "@/server/repositories/projects";
import { listDictionaryItemsForWorkspace } from "@/server/services/dictionary-items";

export type LeadFunnelResponse = {
  range: LeadFunnelDateRange;
  includeArchived: false;
  metricMode: "share_of_total";
  metricModeNote: string;
  funnel: BuiltLeadFunnel;
  benchmark: {
    population: "same_project_type" | "all_active_projects" | "insufficient";
    peerCount: number;
    deltas: FunnelBenchmarkDelta[] | null;
    summary: string | null;
  };
  mappedStatuses: Array<{
    id: string;
    key: string;
    label: string;
    bucket: MappedFunnelStatus["bucket"];
  }>;
};

function createdAtFromForRange(range: LeadFunnelDateRange): Date | null {
  if (range === "all") return null;
  const days = range === "30d" ? 30 : 90;
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return from;
}

function countsMap(
  rows: Array<{ statusId: string; count: number }>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.statusId] = (map[row.statusId] ?? 0) + row.count;
  }
  return map;
}

export async function getProjectLeadFunnel(input: {
  workspaceId: string;
  projectId: string;
  range?: LeadFunnelDateRange;
}): Promise<LeadFunnelResponse> {
  const range = input.range ?? "all";
  const createdAtFrom = createdAtFromForRange(range);

  const statusItems = await listDictionaryItemsForWorkspace(input.workspaceId, {
    type: "lead_status",
  });

  const mapped = mapLeadStatusesToFunnel(
    statusItems.map((item) => ({
      id: item.id,
      key: item.key,
      label: item.label,
      color: item.color,
      order: item.order,
    })),
  );

  const [projectRows, workspaceRows, projects] = await Promise.all([
    groupProjectLeadsByStatus(input.workspaceId, input.projectId, {
      createdAtFrom,
    }),
    groupWorkspaceLeadsByProjectAndStatus(input.workspaceId, { createdAtFrom }),
    findProjects(input.workspaceId, { includeArchived: false }),
  ]);

  const funnel = buildLeadFunnel({
    mappedStatuses: mapped,
    countsByStatusId: countsMap(projectRows),
  });

  const current = projects.find((project) => project.id === input.projectId);
  const projectType = current?.projectType ?? null;

  const countsByProject = new Map<string, Record<string, number>>();
  for (const row of workspaceRows) {
    const existing = countsByProject.get(row.projectId) ?? {};
    existing[row.statusId] = (existing[row.statusId] ?? 0) + row.count;
    countsByProject.set(row.projectId, existing);
  }

  const peerSnapshots: ProjectFunnelSnapshot[] = projects.map((project) => {
    const built = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: countsByProject.get(project.id) ?? {},
    });
    return {
      projectId: project.id,
      projectType: project.projectType,
      totalLeads: built.totalLeads,
      rates: built.rates,
    };
  });

  const selectedPeers = selectBenchmarkPeers({
    projectId: input.projectId,
    projectType,
    candidates: peerSnapshots,
  });

  const sameTypeUsed =
    Boolean(projectType) &&
    selectedPeers.length > 0 &&
    selectedPeers.every((peer) => peer.projectType === projectType);

  const deltas = buildFunnelBenchmarkDeltas({
    projectRates: funnel.rates,
    peers: selectedPeers,
  });

  return {
    range,
    includeArchived: false,
    metricMode: "share_of_total",
    metricModeNote:
      "Rates are share of current-status leads (of total). Stage-to-stage conversion requires status-history events and is not shown yet.",
    funnel,
    benchmark: {
      population: !deltas
        ? "insufficient"
        : sameTypeUsed
          ? "same_project_type"
          : "all_active_projects",
      peerCount: selectedPeers.length,
      deltas,
      summary: formatBenchmarkSummary(deltas),
    },
    mappedStatuses: mapped.map((item) => ({
      id: item.id,
      key: item.key,
      label: item.label,
      bucket: item.bucket,
    })),
  };
}
