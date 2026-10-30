import { describe, expect, it } from "vitest";

import {
  mapLeadStatusesToFunnel,
  presentActiveStages,
  resolveLeadFunnelBucket,
  workspaceHasWonOutcome,
} from "@/lib/lead-funnel-mapping";
import {
  buildFunnelBenchmarkDeltas,
  buildLeadFunnel,
  formatBenchmarkSummary,
  median,
  selectBenchmarkPeers,
} from "@/lib/lead-funnel-metrics";

describe("resolveLeadFunnelBucket", () => {
  it("maps seeded and aliased statuses without hard-coding ids", () => {
    expect(resolveLeadFunnelBucket({ key: "new", label: "New" })).toBe("new");
    expect(
      resolveLeadFunnelBucket({ key: "contacted", label: "Contacted" }),
    ).toBe("contacted");
    expect(
      resolveLeadFunnelBucket({
        key: "called_no_answer",
        label: "Called — no answer",
      }),
    ).toBe("contacted");
    expect(resolveLeadFunnelBucket({ key: "visit", label: "Visit" })).toBe(
      "visit",
    );
    expect(
      resolveLeadFunnelBucket({ key: "qualified", label: "Qualified" }),
    ).toBe("qualified");
    expect(resolveLeadFunnelBucket({ key: "won", label: "Won" })).toBe("won");
    expect(resolveLeadFunnelBucket({ key: "lost", label: "Lost" })).toBe(
      "lost",
    );
    expect(
      resolveLeadFunnelBucket({
        key: "not_interested",
        label: "Not interested",
      }),
    ).toBe("not_interested");
    expect(
      resolveLeadFunnelBucket({ key: "unresponsive", label: "Unresponsive" }),
    ).toBe("unresponsive");
  });

  it("falls back to other for unknown statuses", () => {
    expect(
      resolveLeadFunnelBucket({ key: "nurture", label: "Long nurture" }),
    ).toBe("other");
  });
});

describe("buildLeadFunnel", () => {
  const mapped = mapLeadStatusesToFunnel([
    { id: "s-new", key: "new", label: "New" },
    { id: "s-contacted", key: "contacted", label: "Contacted" },
    { id: "s-visit", key: "visit", label: "Visit" },
    { id: "s-qualified", key: "qualified", label: "Qualified" },
    { id: "s-lost", key: "lost", label: "Lost" },
    { id: "s-ni", key: "not_interested", label: "Not interested" },
    { id: "s-un", key: "unresponsive", label: "Unresponsive" },
  ]);

  it("reconciles counts to total and uses share-of-total rates", () => {
    const funnel = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: {
        "s-contacted": 3,
        "s-visit": 1,
        "s-ni": 4,
        "s-un": 2,
        "s-lost": 2,
      },
    });

    expect(funnel.totalLeads).toBe(12);
    expect(funnel.metricMode).toBe("share_of_total");
    expect(funnel.won).toBeNull();
    expect(workspaceHasWonOutcome(mapped)).toBe(false);
    expect(presentActiveStages(mapped)).toEqual([
      "new",
      "contacted",
      "visit",
      "qualified",
    ]);
    expect(funnel.activeStages.find((s) => s.bucket === "contacted")?.count).toBe(
      3,
    );
    expect(funnel.activeStages.find((s) => s.bucket === "new")?.count).toBe(0);
    expect(funnel.exited.count).toBe(8);
    expect(funnel.rates.contacted).toBeCloseTo(3 / 12);
    expect(funnel.rates.exited).toBeCloseTo(8 / 12);
    expect(funnel.rateTooltips.contacted).toMatch(/of total/);
    expect(funnel.rateTooltips.contacted).not.toMatch(/Conversion/);
  });

  it("uses historical conversion when ever-reached counts are provided", () => {
    const funnel = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: {
        "s-contacted": 3,
        "s-visit": 1,
        "s-qualified": 0,
      },
      everReachedByBucket: {
        new: 10,
        contacted: 8,
        visit: 4,
        qualified: 1,
      },
    });

    expect(funnel.metricMode).toBe("historical_conversion");
    const visit = funnel.activeStages.find((s) => s.bucket === "visit");
    expect(visit?.conversionFromPrior).toBeCloseTo(4 / 8);
    expect(visit?.conversionLabel).toBe("of contacted");
    expect(funnel.conversions.some((c) => c.label === "Contacted → Visit")).toBe(
      true,
    );
    expect(funnel.rateTooltips.visit).toMatch(/Conversion/);
  });

  it("stays share_of_total when ever-reached is omitted (seed-only / no transitions)", () => {
    // Service gates conversion on real transitions and omits everReached otherwise.
    const funnel = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: {
        "s-contacted": 3,
        "s-visit": 1,
      },
      everReachedByBucket: null,
    });
    expect(funnel.metricMode).toBe("share_of_total");
    expect(
      funnel.activeStages.find((s) => s.bucket === "visit")?.conversionFromPrior,
    ).toBeNull();
    expect(funnel.conversions).toHaveLength(0);
  });

  it("shows — conversion when the prior stage never had leads", () => {
    const funnel = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: { "s-visit": 1 },
      everReachedByBucket: {
        new: 0,
        contacted: 0,
        visit: 1,
        qualified: 0,
      },
    });
    const visit = funnel.activeStages.find((s) => s.bucket === "visit");
    expect(visit?.conversionFromPrior).toBeNull();
    expect(visit?.conversionLabel).toBe("of contacted");
  });

  it("includes Won only when a matching lead_status exists", () => {
    const withWon = mapLeadStatusesToFunnel([
      ...mapped,
      { id: "s-won", key: "won", label: "Won" },
    ]);
    const funnel = buildLeadFunnel({
      mappedStatuses: withWon,
      countsByStatusId: { "s-won": 2, "s-contacted": 2 },
    });
    expect(funnel.won?.count).toBe(2);
    expect(funnel.totalLeads).toBe(4);
  });

  it("returns null shares when there are no leads", () => {
    const funnel = buildLeadFunnel({
      mappedStatuses: mapped,
      countsByStatusId: {},
    });
    expect(funnel.totalLeads).toBe(0);
    expect(funnel.rates.contacted).toBeNull();
    expect(funnel.activeStages[0]?.shareOfTotal).toBeNull();
  });
});

describe("benchmark helpers", () => {
  it("computes median and hides sparse benchmarks", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);

    const deltas = buildFunnelBenchmarkDeltas({
      projectRates: {
        new: 0.1,
        contacted: 0.3,
        visit: 0.2,
        qualified: 0.05,
        won: null,
        exited: 0.4,
      },
      peers: [
        {
          projectId: "a",
          projectType: "development",
          totalLeads: 20,
          rates: {
            new: 0.1,
            contacted: 0.2,
            visit: 0.1,
            qualified: 0.05,
            won: null,
            exited: 0.5,
          },
        },
        {
          projectId: "b",
          projectType: "development",
          totalLeads: 20,
          rates: {
            new: 0.1,
            contacted: 0.25,
            visit: 0.15,
            qualified: 0.05,
            won: null,
            exited: 0.45,
          },
        },
      ],
      minPeers: 3,
    });
    expect(deltas).toBeNull();
  });

  it("prefers same project type peers when enough exist", () => {
    const peers = selectBenchmarkPeers({
      projectId: "self",
      projectType: "development",
      candidates: [
        {
          projectId: "self",
          projectType: "development",
          totalLeads: 12,
          rates: {
            new: 0,
            contacted: 0.25,
            visit: 0.1,
            qualified: 0,
            won: null,
            exited: 0.5,
          },
        },
        ...["a", "b", "c"].map((id) => ({
          projectId: id,
          projectType: "development" as string | null,
          totalLeads: 10,
          rates: {
            new: 0,
            contacted: 0.2,
            visit: 0.1,
            qualified: 0,
            won: null,
            exited: 0.5,
          },
        })),
        {
          projectId: "other-type",
          projectType: "resale_mandate",
          totalLeads: 50,
          rates: {
            new: 0,
            contacted: 0.9,
            visit: 0.5,
            qualified: 0.2,
            won: null,
            exited: 0.1,
          },
        },
      ],
    });
    expect(peers).toHaveLength(3);
    expect(peers.every((p) => p.projectType === "development")).toBe(true);
  });

  it("formats a compact benchmark summary", () => {
    expect(
      formatBenchmarkSummary([
        {
          key: "visit",
          label: "Visit",
          deltaPp: 6,
          favourable: true,
        },
        {
          key: "won",
          label: "Won",
          deltaPp: -3,
          favourable: false,
        },
      ]),
    ).toBe("Visit +6pp · Won -3pp");
  });
});
