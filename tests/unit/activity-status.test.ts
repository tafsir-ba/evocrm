import { describe, expect, it } from "vitest";

import {
  isActivityOverdue,
  isActivityUpcoming,
} from "@/server/services/activity-status";

describe("activity overdue/upcoming helpers", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("marks pending past-due activities as overdue", () => {
    expect(
      isActivityOverdue(
        {
          dueDate: new Date("2026-06-14T12:00:00.000Z"),
          archivedAt: null,
        },
        "pending",
        now,
      ),
    ).toBe(true);
  });

  it("excludes completed activities from overdue", () => {
    expect(
      isActivityOverdue(
        {
          dueDate: new Date("2026-06-14T12:00:00.000Z"),
          archivedAt: null,
        },
        "completed",
        now,
      ),
    ).toBe(false);
  });

  it("excludes archived activities from overdue", () => {
    expect(
      isActivityOverdue(
        {
          dueDate: new Date("2026-06-14T12:00:00.000Z"),
          archivedAt: new Date(),
        },
        "pending",
        now,
      ),
    ).toBe(false);
  });

  it("includes pending future-due activities in upcoming", () => {
    expect(
      isActivityUpcoming(
        {
          dueDate: new Date("2026-06-16T12:00:00.000Z"),
          archivedAt: null,
        },
        "pending",
        now,
      ),
    ).toBe(true);
  });
});
