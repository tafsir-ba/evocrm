import { describe, expect, it } from "vitest";

import {
  buildEnrollmentScheduledSteps,
  computeEnrollmentNextSendAt,
} from "@/server/utils/campaign-enrollment-schedule";

describe("campaign enrollment schedule", () => {
  it("projects all remaining drip steps from enrollment timing anchors", () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
      "UTC",
      now,
    );

    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toMatchObject({
      stepOrder: 1,
      subject: "drip 1",
      state: "pending",
    });
    expect(schedule[0]?.scheduledAt?.toISOString()).toBe("2026-06-14T12:00:00.000Z");
    expect(schedule[1]).toMatchObject({
      stepOrder: 2,
      subject: "drip 2",
      state: "pending",
    });
    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("reflects updated step send times without relying on stored nextSendAt", () => {
    const now = new Date("2026-06-17T14:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "16:45", subject: "drip 1" },
        { order: 2, delayDays: 0, sendTime: "16:46", subject: "drip 2" },
      ],
      "UTC",
      now,
    );

    expect(schedule[0]?.scheduledAt?.toISOString()).toBe("2026-06-17T16:45:00.000Z");
    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-17T16:46:00.000Z");
  });

  it("marks prior steps as sent after the enrollment advances", () => {
    const lastSentAt = new Date("2026-06-14T12:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 2,
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        lastSentAt,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
      "UTC",
      lastSentAt,
    );

    expect(schedule[0]?.state).toBe("sent");
    expect(schedule[0]?.scheduledAt).toBeNull();
    expect(schedule[1]?.state).toBe("pending");
    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("chains zero-delay follow-up steps at the next send-time slot", () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        status: "active",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 0, sendTime: "12:00", subject: "drip 2" },
      ],
      "UTC",
      now,
    );

    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("matches the current step projection used for rescheduling", () => {
    const now = new Date("2026-06-17T16:40:00.000Z");
    const enrollment = {
      currentStep: 1,
      createdAt: new Date("2026-06-17T14:00:00.000Z"),
      lastSentAt: null,
      status: "active" as const,
    };
    const step = { order: 1, delayDays: 0, sendTime: "16:45", subject: "drip 1" };

    const schedule = buildEnrollmentScheduledSteps(enrollment, [step], "UTC", now);
    const nextSendAt = computeEnrollmentNextSendAt(enrollment, step, "UTC", now);

    expect(schedule[0]?.scheduledAt?.toISOString()).toBe(nextSendAt.toISOString());
  });

  it("marks pending schedule steps as paused when enrollment is paused", () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        status: "paused",
      },
      [
        { order: 1, delayDays: 0, sendTime: "12:00", subject: "drip 1" },
        { order: 2, delayDays: 1, sendTime: "12:00", subject: "drip 2" },
      ],
      "UTC",
      now,
    );

    expect(schedule[0]?.state).toBe("paused");
    expect(schedule[1]?.state).toBe("paused");
  });

  it("schedules unsent steps from now when recomputing next send", () => {
    const now = new Date("2026-06-17T16:40:00.000Z");

    const nextSendAt = computeEnrollmentNextSendAt(
      {
        createdAt: new Date("2026-06-17T14:00:00.000Z"),
        lastSentAt: null,
        currentStep: 1,
      },
      { delayDays: 0, sendTime: "16:45" },
      "UTC",
      now,
    );

    expect(nextSendAt.toISOString()).toBe("2026-06-17T16:45:00.000Z");
  });
});
