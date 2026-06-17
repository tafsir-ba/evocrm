import { describe, expect, it } from "vitest";

import {
  computeNextSendAt,
  computeRescheduledSendAt,
  isCampaignOrderOverdue,
  isScheduledSendDue,
} from "@/server/utils/campaign-schedule";

describe("campaign schedule", () => {
  it("uses the anchor for zero-delay steps without a send time", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0);

    expect(nextSendAt.getTime()).toBe(anchor.getTime());
  });

  it("adds whole days for positive delays", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 3);

    expect(nextSendAt.toISOString()).toBe("2026-06-17T12:00:00.000Z");
  });

  it("schedules at send time in workspace timezone after delay days", () => {
    const anchor = new Date("2026-06-14T15:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 1, {
      sendTime: "09:00",
      timeZone: "UTC",
    });

    expect(nextSendAt.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("keeps the exact configured slot when a zero-delay send time already passed today", () => {
    const anchor = new Date("2026-06-14T15:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0, {
      sendTime: "09:00",
      timeZone: "UTC",
    });

    expect(nextSendAt.toISOString()).toBe("2026-06-14T09:00:00.000Z");
  });

  it("schedules later today when zero-delay send time is still ahead", () => {
    const anchor = new Date("2026-06-14T10:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0, {
      sendTime: "17:06",
      timeZone: "UTC",
    });

    expect(nextSendAt.toISOString()).toBe("2026-06-14T17:06:00.000Z");
  });

  it("reschedules overdue sends for immediate pickup", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");
    const nextSendAt = computeRescheduledSendAt(anchor, 3, { overdue: true });

    expect(nextSendAt.getTime()).toBe(anchor.getTime());
  });

  it("reschedules overdue sends immediately even when send time is configured", () => {
    const anchor = new Date("2026-06-14T13:00:00.000Z");
    const nextSendAt = computeRescheduledSendAt(anchor, 0, {
      overdue: true,
      sendTime: "09:00",
      timeZone: "UTC",
    });

    expect(nextSendAt.getTime()).toBe(anchor.getTime());
  });

  it("keeps future sends blocked until due", () => {
    const future = new Date("2026-06-20T12:00:00.000Z");
    const now = new Date("2026-06-14T12:00:00.000Z");

    expect(isScheduledSendDue(future, now)).toBe(false);
  });

  it("uses the exact configured send time when enrolling shortly before the slot", () => {
    const anchor = new Date("2026-06-14T17:28:30.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0, {
      sendTime: "17:29",
      timeZone: "UTC",
    });

    expect(nextSendAt.toISOString()).toBe("2026-06-14T17:29:00.000Z");
  });

  it("schedules step two at the exact later slot after step one sends", () => {
    const stepOneSentAt = new Date("2026-06-17T07:38:00.000Z");
    const nextSendAt = computeNextSendAt(stepOneSentAt, 0, {
      sendTime: "09:40",
      timeZone: "Europe/Zurich",
    });

    expect(nextSendAt.toISOString()).toBe("2026-06-17T07:40:00.000Z");
  });

  it("marks an order overdue when activate/resume happens after the configured slot", () => {
    const scheduleAnchor = new Date("2026-06-17T07:30:00.000Z");
    const pickupAnchor = new Date("2026-06-17T07:45:00.000Z");

    expect(
      isCampaignOrderOverdue(scheduleAnchor, pickupAnchor, 0, {
        sendTime: "09:34",
        timeZone: "Europe/Zurich",
      }),
    ).toBe(true);
  });

  it("keeps future orders on-time when activate/resume happens before the slot", () => {
    const scheduleAnchor = new Date("2026-06-17T07:30:00.000Z");
    const pickupAnchor = new Date("2026-06-17T07:31:00.000Z");

    expect(
      isCampaignOrderOverdue(scheduleAnchor, pickupAnchor, 0, {
        sendTime: "09:34",
        timeZone: "Europe/Zurich",
      }),
    ).toBe(false);
  });
});
