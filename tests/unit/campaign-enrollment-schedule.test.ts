import { describe, expect, it } from "vitest";

import { buildEnrollmentScheduledSteps } from "@/server/utils/campaign-enrollment-schedule";

describe("campaign enrollment schedule", () => {
  it("projects all remaining drip steps from the current next send anchor", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        nextSendAt: anchor,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
    );

    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toMatchObject({
      stepOrder: 1,
      subject: "drip 1",
      state: "pending",
    });
    expect(schedule[0]?.scheduledAt?.toISOString()).toBe(
      new Date(anchor.getTime()).toISOString(),
    );
    expect(schedule[1]).toMatchObject({
      stepOrder: 2,
      subject: "drip 2",
      state: "pending",
    });
    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("marks prior steps as sent after the enrollment advances", () => {
    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 2,
        nextSendAt: new Date("2026-06-15T12:00:00.000Z"),
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
    );

    expect(schedule[0]?.state).toBe("sent");
    expect(schedule[0]?.scheduledAt).toBeNull();
    expect(schedule[1]?.state).toBe("pending");
  });

  it("chains zero-delay follow-up steps at the next send-time slot", () => {
    const anchor = new Date("2026-06-14T12:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        nextSendAt: anchor,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 0, sendTime: "12:00", subject: "drip 2" },
      ],
      "UTC",
    );

    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("marks pending schedule steps as paused when enrollment is paused", () => {
    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        nextSendAt: new Date("2026-06-14T12:00:00.000Z"),
        status: "paused",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
    );

    expect(schedule[0]?.state).toBe("paused");
    expect(schedule[1]?.state).toBe("paused");
  });
});
