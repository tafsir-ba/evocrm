import {
  LEAD_FUNNEL_EXIT_REASONS,
  labelForFunnelBucket,
  presentActiveStages,
  presentExitReasons,
  workspaceHasWonOutcome,
  type LeadFunnelActiveStage,
  type LeadFunnelBucket,
  type LeadFunnelExitReason,
  type MappedFunnelStatus,
} from "@/lib/lead-funnel-mapping";

export const LEAD_FUNNEL_BENCHMARK_MIN_LEADS = 5;
export const LEAD_FUNNEL_BENCHMARK_MIN_PEERS = 3;

export type LeadFunnelDateRange = "all" | "30d" | "90d";

export type FunnelBucketCount = {
  bucket: LeadFunnelBucket;
  label: string;
  count: number;
  /** Share of total leads (0–1). Null when total is 0. */
  shareOfTotal: number | null;
  statusIds: string[];
};

export type FunnelRateKey =
  | LeadFunnelActiveStage
  | "won"
  | "exited";

export type FunnelRates = Record<FunnelRateKey, number | null>;

export type FunnelBenchmarkDelta = {
  key: FunnelRateKey;
  label: string;
  /** Project rate minus benchmark median, in percentage points. */
  deltaPp: number;
  favourable: boolean | null;
};

export type BuiltLeadFunnel = {
  totalLeads: number;
  /** Metric mode shipped in V1 — no status-history conversion claims. */
  metricMode: "share_of_total";
  activeStages: FunnelBucketCount[];
  won: FunnelBucketCount | null;
  exited: {
    count: number;
    shareOfTotal: number | null;
    reasons: FunnelBucketCount[];
    other: FunnelBucketCount | null;
    statusIds: string[];
  };
  rates: FunnelRates;
  /** Human-readable rate tooltips keyed by funnel row id. */
  rateTooltips: Record<string, string>;
};

export type ProjectFunnelSnapshot = {
  projectId: string;
  projectType: string | null;
  totalLeads: number;
  rates: FunnelRates;
};

function roundShare(count: number, total: number): number | null {
  if (total <= 0) return null;
  return count / total;
}

function formatPct(share: number | null): string {
  if (share === null) return "—";
  return `${Math.round(share * 100)}%`;
}

export function buildLeadFunnel(input: {
  mappedStatuses: MappedFunnelStatus[];
  /** statusId → count for non-archived leads in scope */
  countsByStatusId: Record<string, number>;
}): BuiltLeadFunnel {
  const { mappedStatuses, countsByStatusId } = input;

  const countFor = (bucket: LeadFunnelBucket): {
    count: number;
    statusIds: string[];
  } => {
    const statusIds = mappedStatuses
      .filter((item) => item.bucket === bucket)
      .map((item) => item.id);
    const count = statusIds.reduce(
      (sum, id) => sum + (countsByStatusId[id] ?? 0),
      0,
    );
    return { count, statusIds };
  };

  // Unknown status ids (deleted dictionary rows) still count toward total.
  const knownIds = new Set(mappedStatuses.map((item) => item.id));
  let orphanCount = 0;
  for (const [statusId, count] of Object.entries(countsByStatusId)) {
    if (!knownIds.has(statusId)) {
      orphanCount += count;
    }
  }

  // Show only active stages that exist in this workspace's dictionary, in
  // canonical order. Zero counts stay visible so the spine remains readable.
  const stagesToShow = presentActiveStages(mappedStatuses);

  const activeStages: FunnelBucketCount[] = stagesToShow.map((bucket) => {
    const { count, statusIds } = countFor(bucket);
    return {
      bucket,
      label: labelForFunnelBucket(bucket),
      count,
      shareOfTotal: null, // filled after total known
      statusIds,
    };
  });

  const wonPresent = workspaceHasWonOutcome(mappedStatuses);
  const wonParts = countFor("won");
  const exitReasonKeys = presentExitReasons(mappedStatuses);
  // Preserve zero-value exit reasons that exist in the dictionary.
  const exitKeys: LeadFunnelExitReason[] =
    exitReasonKeys.length > 0
      ? LEAD_FUNNEL_EXIT_REASONS.filter((r) => exitReasonKeys.includes(r))
      : [];

  const reasons: FunnelBucketCount[] = exitKeys.map((bucket) => {
    const { count, statusIds } = countFor(bucket);
    return {
      bucket,
      label: labelForFunnelBucket(bucket),
      count,
      shareOfTotal: null,
      statusIds,
    };
  });

  const otherParts = countFor("other");
  const otherCount = otherParts.count + orphanCount;
  const exitedCount =
    reasons.reduce((sum, row) => sum + row.count, 0) + otherCount;

  const totalLeads =
    activeStages.reduce((sum, row) => sum + row.count, 0) +
    (wonPresent ? wonParts.count : 0) +
    exitedCount;

  const withShare = (
    row: FunnelBucketCount,
  ): FunnelBucketCount => ({
    ...row,
    shareOfTotal: roundShare(row.count, totalLeads),
  });

  const activeWithShare = activeStages.map(withShare);
  const reasonsWithShare = reasons.map(withShare);
  const otherRow: FunnelBucketCount | null =
    otherCount > 0
      ? withShare({
          bucket: "other",
          label: labelForFunnelBucket("other"),
          count: otherCount,
          shareOfTotal: null,
          statusIds: otherParts.statusIds,
        })
      : null;

  const wonRow: FunnelBucketCount | null = wonPresent
    ? withShare({
        bucket: "won",
        label: labelForFunnelBucket("won"),
        count: wonParts.count,
        shareOfTotal: null,
        statusIds: wonParts.statusIds,
      })
    : null;

  const rates: FunnelRates = {
    new: roundShare(
      activeWithShare.find((r) => r.bucket === "new")?.count ?? 0,
      totalLeads,
    ),
    contacted: roundShare(
      activeWithShare.find((r) => r.bucket === "contacted")?.count ?? 0,
      totalLeads,
    ),
    visit: roundShare(
      activeWithShare.find((r) => r.bucket === "visit")?.count ?? 0,
      totalLeads,
    ),
    qualified: roundShare(
      activeWithShare.find((r) => r.bucket === "qualified")?.count ?? 0,
      totalLeads,
    ),
    won: wonRow ? roundShare(wonRow.count, totalLeads) : null,
    exited: roundShare(exitedCount, totalLeads),
  };

  const rateTooltips: Record<string, string> = {
    total: "Non-archived leads currently assigned to this project.",
  };
  for (const row of activeWithShare) {
    rateTooltips[row.bucket] =
      `${row.label} rate = ${row.label} leads ÷ total leads` +
      (row.shareOfTotal === null
        ? " (no leads in scope)."
        : ` = ${formatPct(row.shareOfTotal)} of total.`);
  }
  if (wonRow) {
    rateTooltips.won =
      `Won rate = Won leads ÷ total leads` +
      (wonRow.shareOfTotal === null
        ? " (no leads in scope)."
        : ` = ${formatPct(wonRow.shareOfTotal)} of total.`);
  }
  rateTooltips.exited =
    `Exit rate = (Lost + Not interested + Unresponsive` +
    `${otherRow ? " + Other" : ""}) ÷ total leads` +
    (rates.exited === null
      ? " (no leads in scope)."
      : ` = ${formatPct(rates.exited)} of total.`);
  for (const row of reasonsWithShare) {
    rateTooltips[row.bucket] =
      `${row.label}: current-status count. Share of total = ${formatPct(row.shareOfTotal)}.`;
  }
  if (otherRow) {
    rateTooltips.other =
      "Statuses that are not mapped to the active funnel, Won, or a named exit reason.";
  }

  const exitStatusIds = [
    ...reasonsWithShare.flatMap((r) => r.statusIds),
    ...(otherRow?.statusIds ?? []),
  ];

  return {
    totalLeads,
    metricMode: "share_of_total",
    activeStages: activeWithShare,
    won: wonRow,
    exited: {
      count: exitedCount,
      shareOfTotal: rates.exited,
      reasons: reasonsWithShare,
      other: otherRow,
      statusIds: exitStatusIds,
    },
    rates,
    rateTooltips,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Compare project rates to the median of eligible benchmark peers.
 * Favourable: higher Contacted/Visit/Qualified/Won, lower Exit.
 */
export function buildFunnelBenchmarkDeltas(input: {
  projectRates: FunnelRates;
  peers: ProjectFunnelSnapshot[];
  minLeads?: number;
  minPeers?: number;
}): FunnelBenchmarkDelta[] | null {
  const minLeads = input.minLeads ?? LEAD_FUNNEL_BENCHMARK_MIN_LEADS;
  const minPeers = input.minPeers ?? LEAD_FUNNEL_BENCHMARK_MIN_PEERS;

  const eligible = input.peers.filter((peer) => peer.totalLeads >= minLeads);
  if (eligible.length < minPeers) {
    return null;
  }

  const keys: Array<{
    key: FunnelRateKey;
    label: string;
    higherIsBetter: boolean;
  }> = [
    { key: "contacted", label: "Contacted", higherIsBetter: true },
    { key: "visit", label: "Visit", higherIsBetter: true },
    { key: "qualified", label: "Qualified", higherIsBetter: true },
    { key: "won", label: "Won", higherIsBetter: true },
    { key: "exited", label: "Exited", higherIsBetter: false },
  ];

  const deltas: FunnelBenchmarkDelta[] = [];

  for (const { key, label, higherIsBetter } of keys) {
    const projectRate = input.projectRates[key];
    if (projectRate === null || projectRate === undefined) {
      continue;
    }
    const peerRates = eligible
      .map((peer) => peer.rates[key])
      .filter((value): value is number => typeof value === "number");
    if (peerRates.length < minPeers) {
      continue;
    }
    const bench = median(peerRates);
    if (bench === null) continue;

    const deltaPp = Math.round((projectRate - bench) * 1000) / 10;
    if (deltaPp === 0) {
      deltas.push({ key, label, deltaPp: 0, favourable: null });
      continue;
    }
    const favourable = higherIsBetter ? deltaPp > 0 : deltaPp < 0;
    deltas.push({ key, label, deltaPp, favourable });
  }

  return deltas.length > 0 ? deltas : null;
}

export function selectBenchmarkPeers(input: {
  projectId: string;
  projectType: string | null;
  candidates: ProjectFunnelSnapshot[];
  minLeads?: number;
}): ProjectFunnelSnapshot[] {
  const minLeads = input.minLeads ?? LEAD_FUNNEL_BENCHMARK_MIN_LEADS;
  const others = input.candidates.filter(
    (peer) =>
      peer.projectId !== input.projectId && peer.totalLeads >= minLeads,
  );

  if (input.projectType) {
    const sameType = others.filter(
      (peer) => peer.projectType === input.projectType,
    );
    if (sameType.length >= LEAD_FUNNEL_BENCHMARK_MIN_PEERS) {
      return sameType;
    }
  }

  // Isolated fallback: all active/completed peers with enough volume.
  return others;
}

export function formatBenchmarkSummary(
  deltas: FunnelBenchmarkDelta[] | null,
): string | null {
  if (!deltas || deltas.length === 0) return null;
  // Prefer the most actionable pair for the compact line.
  const preferredOrder: FunnelRateKey[] = [
    "visit",
    "contacted",
    "qualified",
    "won",
    "exited",
  ];
  const picked = preferredOrder
    .map((key) => deltas.find((d) => d.key === key))
    .filter((d): d is FunnelBenchmarkDelta => Boolean(d))
    .slice(0, 3);

  if (picked.length === 0) return null;

  return picked
    .map((d) => {
      if (d.deltaPp === 0) return `${d.label} —`;
      const sign = d.deltaPp > 0 ? "+" : "";
      return `${d.label} ${sign}${d.deltaPp}pp`;
    })
    .join(" · ");
}
