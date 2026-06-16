import { describe, expect, it } from "vitest";

import {
  IMMEDIATE_SEND_DELAY_MS,
  computeNextSendAt,
  computeRescheduledSendAt,
  isScheduledSendDue,
} from "@/server/utils/campaign-schedule";

describe("campaign schedule", () => {
  it("schedules zero-delay steps one minute after the anchor", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0);

    expect(nextSendAt.getTime()).toBe(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
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

  it("sends immediately when a zero-delay send time already passed today", () => {
    const anchor = new Date("2026-06-14T15:00:00.000Z");
    const nextSendAt = computeNextSendAt(anchor, 0, {
      sendTime: "09:00",
      timeZone: "UTC",
    });

    expect(nextSendAt.getTime()).toBe(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
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

    expect(nextSendAt.getTime()).toBe(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  });

  it("reschedules overdue sends immediately even when send time is configured", () => {
    const anchor = new Date("2026-06-14T13:00:00.000Z");
    const nextSendAt = computeRescheduledSendAt(anchor, 0, {
      overdue: true,
      sendTime: "09:00",
      timeZone: "UTC",
    });

    expect(nextSendAt.getTime()).toBe(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  });

  it("keeps future delayed sends blocked until due", () => {
    const future = new Date("2026-06-20T12:00:00.000Z");

    expect(isScheduledSendDue(future, 3)).toBe(false);
    expect(isScheduledSendDue(future, 0)).toBe(true);
  });
});
