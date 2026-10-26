import { describe, expect, it } from "vitest";

import {
  LEAD_UNTREATED_THRESHOLD_DAYS,
  evaluateLeadUntreated,
  latestLeadTreatmentAt,
  leadUntreatedCutoff,
  parseInboundReceivedAt,
} from "@/lib/lead-untreated-rule";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const NEW_ID = "new-status";

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function evaluate(
  signals: Parameters<typeof evaluateLeadUntreated>[0]["signals"],
  overrides: Partial<Parameters<typeof evaluateLeadUntreated>[0]> = {},
) {
  return evaluateLeadUntreated({
    statusId: NEW_ID,
    newStatusId: NEW_ID,
    archivedAt: null,
    now: NOW,
    signals,
    ...overrides,
  });
}

describe("lead untreated rule", () => {
  it("uses a 30-day threshold", () => {
    expect(LEAD_UNTREATED_THRESHOLD_DAYS).toBe(30);
    expect(leadUntreatedCutoff(NOW).toISOString()).toBe("2026-09-26T12:00:00.000Z");
  });

  it("keeps New leads younger than 30 days", () => {
    expect(evaluate({ createdAt: daysAgo(29) })).toMatchObject({
      eligible: false,
      reason: "recent_treatment",
    });
    expect(evaluate({ createdAt: new Date(daysAgo(30).getTime() + 1) }).eligible).toBe(false);
  });

  it("marks New leads idle for 30 days or more as eligible", () => {
    expect(evaluate({ createdAt: daysAgo(30) })).toMatchObject({ eligible: true, idleDays: 30 });
    expect(evaluate({ createdAt: daysAgo(120) })).toMatchObject({ eligible: true, idleDays: 120 });
  });

  it.each([
    ["activity", { lastActivityAt: daysAgo(3) }],
    ["notes session", { lastVisitSessionAt: daysAgo(10) }],
    ["status change / assignment / edit audit", { lastTreatmentAuditAt: daysAgo(29) }],
    ["last contacted", { lastContactedAt: daysAgo(1) }],
    ["inbound re-submission", { inboundReceivedAt: daysAgo(5) }],
  ])("keeps old New leads with recent %s", (_label, signal) => {
    expect(evaluate({ createdAt: daysAgo(90), ...signal })).toMatchObject({
      eligible: false,
      reason: "recent_treatment",
    });
  });

  it("ignores treatment older than the window", () => {
    const result = evaluate({
      createdAt: daysAgo(200),
      lastActivityAt: daysAgo(45),
      lastTreatmentAuditAt: daysAgo(60),
      lastContactedAt: daysAgo(31),
    });
    expect(result).toMatchObject({ eligible: true, idleDays: 31 });
  });

  it("never touches non-New statuses (including Untreated)", () => {
    for (const statusId of ["untreated-status", "contacted-status", "qualified-status", "lost-status"]) {
      expect(evaluate({ createdAt: daysAgo(400) }, { statusId })).toEqual({
        eligible: false,
        reason: "not_new",
        lastTreatmentAt: null,
      });
    }
  });

  it("never touches archived leads", () => {
    expect(evaluate({ createdAt: daysAgo(400) }, { archivedAt: daysAgo(1) })).toMatchObject({
      eligible: false,
      reason: "archived",
    });
  });

  it("reads integration receivedAt and ignores invalid values", () => {
    expect(
      parseInboundReceivedAt({ integration: { receivedAt: "2026-10-01T00:00:00.000Z" } })?.toISOString(),
    ).toBe("2026-10-01T00:00:00.000Z");
    expect(parseInboundReceivedAt({ integration: { receivedAt: "nope" } })).toBeNull();
    expect(parseInboundReceivedAt({})).toBeNull();
    expect(parseInboundReceivedAt(null)).toBeNull();
    expect(latestLeadTreatmentAt({ createdAt: daysAgo(10), lastActivityAt: null })).toEqual(daysAgo(10));
  });
});
