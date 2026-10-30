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
  countEverReachedForBuckets,
  projectHasLeadStatusTransitions,
} from "@/server/services/lead-status-history";

/** Funnel counts primary project assignment only; archived leads are excluded. */
export const LEAD_FUNNEL_SCOPE_NOTE =
  "Primary project assignment · archived leads excluded";

export type LeadFunnelResponse = {
  range: LeadFunnelDateRange;
  includeArchived: false;
  scopeNote: string;
  metricMode: BuiltLeadFunnel["metricMode"];
  metricModeNote: string;
  funnel: BuiltLeadFunnel;
  history: {
    /** True when the project has at least one real status transition. */
    available: boolean;
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

  // Read-only: never mutate via GET. Conversion needs real transitions
  // (fromStatusId != null); seed-only history stays share_of_total.
  const hasTransitions = await projectHasLeadStatusTransitions(
    input.workspaceId,
    input.projectId,
  );

  const [projectRows, workspaceRows, projects, everReachedRaw] =
    await Promise.all([
      groupProjectLeadsByStatus(input.workspaceId, input.projectId, {
        createdAtFrom,
      }),
      groupWorkspaceLeadsByProjectAndStatus(input.workspaceId, {
        createdAtFrom,
      }),
      findProjects(input.workspaceId, { includeArchived: false }),
      hasTransitions
        ? countEverReachedForBuckets({
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            bucketStatusIds: bucketStatusIdMap(mapped),
            changedAtFrom: createdAtFrom,
          })
        : Promise.resolve(null),
    ]);

  const everReachedByBucket = everReachedRaw
    ? (everReachedRaw as Partial<Record<LeadFunnelBucket, number>>)
    : null;

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

  return {
    range,
    includeArchived: false,
    scopeNote: LEAD_FUNNEL_SCOPE_NOTE,
    metricMode: funnel.metricMode,
    metricModeNote:
      funnel.metricMode === "historical_conversion"
        ? "Secondary stage rates are historical conversion (ever reached stage ÷ ever reached prior). Bar counts remain current-status distribution."
        : "Rates are share of current-status leads (of total). Status history was insufficient for conversion.",
    funnel,
    history: {
      available: hasTransitions,
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
