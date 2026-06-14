import { describe, expect, it } from "vitest";

import {
  IMMEDIATE_SEND_DELAY_MS,
  computeNextSendAt,
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
});
