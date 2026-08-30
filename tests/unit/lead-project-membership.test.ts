import { describe, expect, it } from "vitest";

import {
  compactProjectMembershipLabel,
  detectMembershipConflicts,
  normalizeMembershipPlan,
  planContactProjectMemberships,
  primaryProjectIdFromPlan,
  selectEarliestPrimary,
} from "@/lib/lead-project-membership";

const now = new Date("2026-08-30T12:00:00.000Z");

describe("lead project membership domain", () => {
  it("selects the earliest joined membership as primary", () => {
    const earliest = selectEarliestPrimary(
      [
        { projectId: "later", joinedAt: "2026-03-01T00:00:00.000Z", sourceOrder: 0 },
        { projectId: "earliest", joinedAt: "2024-01-15T00:00:00.000Z", sourceOrder: 3 },
        { projectId: "middle", joinedAt: "2025-06-01T00:00:00.000Z", sourceOrder: 1 },
      ],
      now,
    );

    expect(earliest?.projectId).toBe("earliest");
  });

  it("breaks joinedAt ties with sourceOrder", () => {
    const sameDay = "2024-01-01T00:00:00.000Z";
    const earliest = selectEarliestPrimary(
      [
        { projectId: "second", joinedAt: sameDay, sourceOrder: 2 },
        { projectId: "first", joinedAt: sameDay, sourceOrder: 0 },
        { projectId: "third", joinedAt: sameDay, sourceOrder: 1 },
      ],
      now,
    );

    expect(earliest?.projectId).toBe("first");
  });

  it("detects duplicates, missing primary, and multiple primaries", () => {
    expect(
      detectMembershipConflicts([
        { projectId: "a", isPrimary: true },
        { projectId: "a", isPrimary: false },
      ]),
    ).toContain("duplicate_project");

    expect(detectMembershipConflicts([{ projectId: "a" }])).toContain("missing_primary");

    expect(
      detectMembershipConflicts([
        { projectId: "a", isPrimary: true },
        { projectId: "b", isPrimary: true },
      ]),
    ).toContain("multiple_primaries");
  });

  it("normalizes historical memberships to one earliest primary and drops duplicates", () => {
    const result = normalizeMembershipPlan(
      [
        { projectId: "b", joinedAt: "2025-01-01T00:00:00.000Z", sourceOrder: 1, isPrimary: true },
        { projectId: "a", joinedAt: "2023-01-01T00:00:00.000Z", sourceOrder: 2 },
        { projectId: "a", joinedAt: "2026-01-01T00:00:00.000Z", sourceOrder: 0 },
      ],
      { fallbackNow: now, preferEarliestPrimary: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.memberships).toHaveLength(2);
    expect(primaryProjectIdFromPlan(result.memberships)).toBe("a");
    expect(result.memberships.filter((item) => item.isPrimary)).toHaveLength(1);
  });

  it("retains the current project as primary when no ordered history exists", () => {
    const result = planContactProjectMemberships({
      currentProjectId: "current-project",
      history: [],
      fallbackNow: now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.memberships).toEqual([
      {
        projectId: "current-project",
        isPrimary: true,
        joinedAt: now,
        sourceOrder: 0,
      },
    ]);
  });

  it("prefers historical earliest over the current denormalized project", () => {
    const result = planContactProjectMemberships({
      currentProjectId: "later-project",
      history: [
        { projectId: "later-project", joinedAt: "2026-01-01T00:00:00.000Z", sourceOrder: 1 },
        { projectId: "first-project", joinedAt: "2022-04-01T00:00:00.000Z", sourceOrder: 0 },
      ],
      fallbackNow: now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(primaryProjectIdFromPlan(result.memberships)).toBe("first-project");
  });

  it("formats a compact primary plus secondary count", () => {
    expect(
      compactProjectMembershipLabel({ primaryName: "Les Terrasses", secondaryCount: 2 }),
    ).toBe("Les Terrasses +2");
    expect(compactProjectMembershipLabel({ primaryName: null, secondaryCount: 0 })).toBe("—");
  });
});
