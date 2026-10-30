import "server-only";

import {
  mapLeadStatusesToFunnel,
  type LeadFunnelBucket,
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
import {
  backfillLeadStatusHistoryForProject,
  countEverReachedForBuckets,
  projectHasLeadStatusHistory,
} from "@/server/services/lead-status-history";

export type LeadFunnelResponse = {
  range: LeadFunnelDateRange;
  includeArchived: false;
  metricMode: BuiltLeadFunnel["metricMode"];
  metricModeNote: string;
  funnel: BuiltLeadFunnel;
  history: {
    available: boolean;
    backfill?: { seeded: number; fromAudits: number };
  };
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

function bucketStatusIdMap(
  mapped: MappedFunnelStatus[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of mapped) {
    const list = map[item.bucket] ?? [];
    list.push(item.id);
    map[item.bucket] = list;
  }
  return map;
}

export async function getProjectLeadFunnel(input: {
  workspaceId: string;
  projectId: string;
  range?: LeadFunnelDateRange;
  /** When true (default), seed history from audits/current status if empty. */
  ensureHistory?: boolean;
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

  let historyBackfill: { seeded: number; fromAudits: number } | undefined;
  const hadHistory = await projectHasLeadStatusHistory(
    input.workspaceId,
    input.projectId,
  );
  if (!hadHistory && input.ensureHistory !== false) {
    historyBackfill = await backfillLeadStatusHistoryForProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
  }

  const [projectRows, workspaceRows, projects, everReachedRaw] =
    await Promise.all([
      groupProjectLeadsByStatus(input.workspaceId, input.projectId, {
        createdAtFrom,
      }),
      groupWorkspaceLeadsByProjectAndStatus(input.workspaceId, {
        createdAtFrom,
      }),
      findProjects(input.workspaceId, { includeArchived: false }),
      countEverReachedForBuckets({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        bucketStatusIds: bucketStatusIdMap(mapped),
        changedAtFrom: createdAtFrom,
      }),
    ]);

  const everReachedByBucket = everReachedRaw as Partial<
    Record<LeadFunnelBucket, number>
  >;

  const funnel = buildLeadFunnel({
    mappedStatuses: mapped,
    countsByStatusId: countsMap(projectRows),
    everReachedByBucket,
  });

  const current = projects.find((project) => project.id === input.projectId);
  const projectType = current?.projectType ?? null;

  const countsByProject = new Map<string, Record<string, number>>();
  for (const row of workspaceRows) {
    const existing = countsByProject.get(row.projectId) ?? {};
    existing[row.statusId] = (existing[row.statusId] ?? 0) + row.count;
    countsByProject.set(row.projectId, existing);
  }

  // Peer benchmarks still use current-status share rates (comparable without
  // requiring every peer to have dense history). Conversion is project-local.
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

  const historyAvailable =
    funnel.metricMode === "historical_conversion" ||
    (historyBackfill !== undefined &&
      historyBackfill.seeded + historyBackfill.fromAudits > 0) ||
    hadHistory;

  return {
    range,
    includeArchived: false,
    metricMode: funnel.metricMode,
    metricModeNote:
      funnel.metricMode === "historical_conversion"
        ? "Secondary stage rates are historical conversion (ever reached stage ÷ ever reached prior). Bar counts remain current-status distribution."
        : "Rates are share of current-status leads (of total). Status history was insufficient for conversion.",
    funnel,
    history: {
      available: historyAvailable,
      backfill: historyBackfill,
    },
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
