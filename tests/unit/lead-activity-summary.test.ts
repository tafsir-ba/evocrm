import { describe, expect, it } from "vitest";

import { summarizeLeadActivities } from "@/lib/lead-activity-summary";

describe("summarizeLeadActivities", () => {
  it("picks the most recently updated activity and the earliest open next step", () => {
    const summaries = summarizeLeadActivities([
      {
        id: "old",
        leadId: "lead-1",
        title: "Premier contact",
        dueDate: null,
        nextActionDate: null,
        completedAt: new Date("2026-08-20T10:00:00.000Z"),
        cancelledAt: null,
        updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        createdAt: new Date("2026-08-19T10:00:00.000Z"),
      },
      {
        id: "recent",
        leadId: "lead-1",
        title: "Appel François",
        dueDate: null,
        nextActionDate: null,
        completedAt: new Date("2026-08-28T15:00:00.000Z"),
        cancelledAt: null,
        updatedAt: new Date("2026-08-28T15:00:00.000Z"),
        createdAt: new Date("2026-08-28T14:00:00.000Z"),
      },
      {
        id: "later-open",
        leadId: "lead-1",
        title: "Visite",
        dueDate: new Date("2026-09-10T09:00:00.000Z"),
        nextActionDate: null,
        completedAt: null,
        cancelledAt: null,
        updatedAt: new Date("2026-08-27T09:00:00.000Z"),
        createdAt: new Date("2026-08-27T09:00:00.000Z"),
      },
      {
        id: "soon-open",
        leadId: "lead-1",
        title: "Relance Genève",
        dueDate: null,
        nextActionDate: new Date("2026-09-01T09:00:00.000Z"),
        completedAt: null,
        cancelledAt: null,
        updatedAt: new Date("2026-08-26T09:00:00.000Z"),
        createdAt: new Date("2026-08-26T09:00:00.000Z"),
      },
    ]);

    expect(summaries.get("lead-1")).toEqual({
      lastActivity: {
        id: "recent",
        title: "Appel François",
        at: new Date("2026-08-28T15:00:00.000Z"),
      },
      nextAction: {
        id: "soon-open",
        title: "Relance Genève",
        at: new Date("2026-09-01T09:00:00.000Z"),
      },
    });
  });

  it("ignores completed or cancelled next dates and activities without a lead", () => {
    const summaries = summarizeLeadActivities([
      {
        id: "orphan",
        leadId: null,
        title: "Orphan",
        dueDate: new Date("2026-08-01T00:00:00.000Z"),
        nextActionDate: null,
        completedAt: null,
        cancelledAt: null,
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "done",
        leadId: "lead-2",
        title: "Done",
        dueDate: new Date("2026-08-02T00:00:00.000Z"),
        nextActionDate: null,
        completedAt: new Date("2026-08-02T00:00:00.000Z"),
        cancelledAt: null,
        updatedAt: new Date("2026-08-02T00:00:00.000Z"),
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ]);

    expect(summaries.get("lead-2")).toEqual({
      lastActivity: {
        id: "done",
        title: "Done",
        at: new Date("2026-08-02T00:00:00.000Z"),
      },
      nextAction: null,
    });
    expect(summaries.has("")).toBe(false);
  });
});
