import { describe, expect, it } from "vitest";

/**
 * Documents the distinct-enrollment aggregation shape used by
 * countCampaignSendsByStatus so retries do not inflate failed/skipped totals.
 */
describe("newsletter send status counting semantics", () => {
  it("counts one enrollment once even with multiple failed attempt rows", () => {
    const rows = [
      { enrollmentId: "e1", status: "failed" },
      { enrollmentId: "e1", status: "failed" },
      { enrollmentId: "e2", status: "failed" },
      { enrollmentId: "e3", status: "sent" },
      { enrollmentId: "e3", status: "skipped" },
    ];

    const byStatusEnrollment = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = byStatusEnrollment.get(row.status) ?? new Set<string>();
      set.add(row.enrollmentId);
      byStatusEnrollment.set(row.status, set);
    }

    expect(byStatusEnrollment.get("failed")?.size).toBe(2);
    expect(byStatusEnrollment.get("sent")?.size).toBe(1);
    expect(byStatusEnrollment.get("skipped")?.size).toBe(1);
  });
});
