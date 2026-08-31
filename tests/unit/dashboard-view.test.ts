import { describe, expect, it } from "vitest";

import {
  closedPeriodSummary,
  defaultAttentionTab,
  formatCmpReconciliationSummary,
  rankProjectsForOperator,
} from "@/lib/dashboard-view";

const now = new Date(2026, 7, 30, 12, 0, 0);

describe("dashboard view helpers", () => {
  it("opens the first queue that actually has work", () => {
    expect(defaultAttentionTab({ overdue: 2, dueToday: 1 })).toBe("overdue");
    expect(defaultAttentionTab({ overdue: 0, dueToday: 3 })).toBe("dueToday");
    expect(defaultAttentionTab({ overdue: 0, dueToday: 0 })).toBe("upcoming");
  });

  it("derives won-of-closed only when closed deals exist", () => {
    expect(closedPeriodSummary(0, 0)).toBeNull();
    expect(closedPeriodSummary(3, 1)).toEqual({
      won: 3,
      lost: 1,
      closed: 4,
      wonShareLabel: "75% won of closed",
    });
  });

  it("surfaces stale inbound demand before unknown and quieter active projects", () => {
    const ranked = rankProjectsForOperator(
      [
        {
          id: "active",
          name: "Les Terrasses",
          reference: "LT-01",
          archivedAt: null,
          createdAt: now.toISOString(),
          counts: {
            leads: 2,
            lastActivityAt: now.toISOString(),
            lastGenuineInboundAt: now.toISOString(),
            lastGenuineInboundBasis: "received_at",
          },
        },
        {
          id: "stale",
          name: "Parc des Crêts",
          reference: "PC-02",
          archivedAt: null,
          createdAt: new Date(2026, 5, 1).toISOString(),
          counts: {
            leads: 1,
            lastActivityAt: now.toISOString(),
            lastGenuineInboundAt: new Date(2026, 6, 1).toISOString(),
            lastGenuineInboundBasis: "source_created",
          },
        },
        {
          id: "imported",
          name: "Bulk import",
          reference: "IMP",
          archivedAt: null,
          createdAt: now.toISOString(),
          counts: {
            leads: 8,
            lastActivityAt: now.toISOString(),
            lastGenuineInboundAt: null,
            lastGenuineInboundBasis: null,
          },
        },
        {
          id: "archived",
          name: "Old",
          reference: null,
          archivedAt: now.toISOString(),
          createdAt: now.toISOString(),
          counts: { leads: 9, lastActivityAt: now.toISOString() },
        },
      ],
      now,
    );

    expect(ranked.map((project) => project.id)).toEqual(["stale", "imported", "active"]);
    expect(ranked[0]?.status.label).toBe("Stale");
    expect(ranked[1]?.status.label).toBe("Unknown");
    expect(ranked[2]?.status.label).toBe("Active");
  });

  it("explains CMP source cohort versus CRM membership without blending counts", () => {
    expect(
      formatCmpReconciliationSummary({
        sourceCohortCount: 46,
        membershipCount: 0,
        overlapCount: 0,
        sourceOnlyCount: 46,
        membershipOnlyCount: 0,
        cmpProjectCount: 0,
      }),
    ).toContain("0 CRM CMP project memberships");
  });
});
