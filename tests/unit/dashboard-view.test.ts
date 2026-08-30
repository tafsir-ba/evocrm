import { describe, expect, it } from "vitest";

import {
  closedPeriodSummary,
  defaultAttentionTab,
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

  it("surfaces stale projects before quieter active ones", () => {
    const ranked = rankProjectsForOperator(
      [
        {
          id: "active",
          name: "Les Terrasses",
          reference: "LT-01",
          archivedAt: null,
          createdAt: now.toISOString(),
          counts: { leads: 2, lastActivityAt: now.toISOString() },
        },
        {
          id: "stale",
          name: "Parc des Crêts",
          reference: "PC-02",
          archivedAt: null,
          createdAt: new Date(2026, 5, 1).toISOString(),
          counts: { leads: 1, lastActivityAt: new Date(2026, 6, 1).toISOString() },
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

    expect(ranked.map((project) => project.id)).toEqual(["stale", "active"]);
    expect(ranked[0]?.status.label).toBe("Stale");
  });
});
