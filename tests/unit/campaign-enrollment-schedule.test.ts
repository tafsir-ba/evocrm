import { describe, expect, it } from "vitest";

import {
  buildEnrollmentScheduledSteps,
  computeEnrollmentNextSendAt,
  mapLatestSendLogsByStepOrder,
} from "@/server/utils/campaign-enrollment-schedule";

const steps = [
  {
    id: "step-1",
    order: 1,
    delayDays: 0,
    sendTime: "12:00",
    subject: "drip 1",
  },
  {
    id: "step-2",
    order: 2,
    delayDays: 1,
    sendTime: "12:00",
    subject: "drip 2",
  },
];

const enrollmentTiming = {
  sendClaimExpiresAt: null as Date | null,
};

describe("campaign enrollment schedule", () => {
  it("projects all remaining drip steps from enrollment timing anchors", () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        nextSendAt: new Date("2026-06-14T12:00:00.000Z"),
        status: "active",
      },
      steps,
      new Map(),
      "UTC",
      now,
    );

    expect(schedule[0]?.state).toBe("scheduled");
    expect(schedule[0]?.scheduledAt?.toISOString()).toBe("2026-06-14T12:00:00.000Z");
    expect(schedule[1]?.state).toBe("scheduled");
    expect(schedule[1]?.scheduledAt?.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("marks a step sent only when the send log confirms provider dispatch", () => {
    const lastSentAt = new Date("2026-06-14T12:00:00.000Z");
    const sendLogs = mapLatestSendLogsByStepOrder(steps, [
      {
        campaignStepId: "step-1",
        status: "sent",
        providerMessageId: "msg-1",
        sentAt: lastSentAt,
        scheduledFor: lastSentAt,
        createdAt: lastSentAt,
      },
    ]);

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 2,
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        lastSentAt,
        nextSendAt: new Date("2026-06-15T12:00:00.000Z"),
        status: "active",
      },
      steps,
      sendLogs,
      "UTC",
      lastSentAt,
    );

    expect(schedule[0]?.state).toBe("sent");
    expect(schedule[1]?.state).toBe("scheduled");
  });

  it("does not mark future steps as sent when currentStep advanced without send logs", () => {
    const now = new Date("2026-06-18T18:39:00.000Z");
    const sendLogs = mapLatestSendLogsByStepOrder(
      [
        { id: "step-1", order: 1 },
        { id: "step-2", order: 2 },
        { id: "step-3", order: 3 },
        { id: "step-4", order: 4 },
      ],
      [
        {
          campaignStepId: "step-1",
          status: "sent",
          providerMessageId: "msg-1",
          sentAt: new Date("2026-06-18T18:37:00.000Z"),
          scheduledFor: new Date("2026-06-18T18:37:00.000Z"),
          createdAt: new Date("2026-06-18T18:37:00.000Z"),
        },
        {
          campaignStepId: "step-2",
          status: "sent",
          providerMessageId: "msg-2",
          sentAt: new Date("2026-06-18T18:37:00.000Z"),
          scheduledFor: new Date("2026-06-18T18:37:00.000Z"),
          createdAt: new Date("2026-06-18T18:37:00.000Z"),
        },
      ],
    );

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 4,
        createdAt: new Date("2026-06-18T18:30:00.000Z"),
        lastSentAt: new Date("2026-06-18T18:37:00.000Z"),
        nextSendAt: new Date("2026-06-18T18:45:00.000Z"),
        status: "active",
      },
      [
        { id: "step-1", order: 1, delayDays: 0, sendTime: "20:37", subject: "test 1" },
        { id: "step-2", order: 2, delayDays: 0, sendTime: "20:37", subject: "test 2" },
        { id: "step-3", order: 3, delayDays: 0, sendTime: "20:40", subject: "test 1" },
        { id: "step-4", order: 4, delayDays: 0, sendTime: "20:45", subject: "test 1" },
      ],
      sendLogs,
      "Europe/Zurich",
      now,
    );

    expect(schedule[0]?.state).toBe("sent");
    expect(schedule[1]?.state).toBe("sent");
    expect(schedule[2]?.state).toBe("scheduled");
    expect(schedule[3]?.state).toBe("scheduled");
  });

  it("does not mark every step sent for completed enrollments without send logs", () => {
    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 3,
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        lastSentAt: new Date("2026-06-14T12:00:00.000Z"),
        nextSendAt: new Date("2026-06-14T12:00:00.000Z"),
        status: "completed",
      },
      [
        ...steps,
        {
          id: "step-3",
          order: 3,
          delayDays: 0,
          sendTime: "20:40",
          subject: "drip 3",
        },
      ],
      mapLatestSendLogsByStepOrder(steps, [
        {
          campaignStepId: "step-1",
          status: "sent",
          providerMessageId: "msg-1",
          sentAt: new Date("2026-06-14T12:00:00.000Z"),
          scheduledFor: new Date("2026-06-14T12:00:00.000Z"),
          createdAt: new Date("2026-06-14T12:00:00.000Z"),
        },
      ]),
      "UTC",
      new Date("2026-06-14T12:30:00.000Z"),
    );

    expect(schedule[0]?.state).toBe("sent");
    expect(schedule[1]?.state).toBe("scheduled");
    expect(schedule[2]?.state).toBe("pending");
  });

  it("marks the current step as sending when a send claim is active", () => {
    const now = new Date("2026-06-14T12:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        sendClaimExpiresAt: new Date("2026-06-14T12:05:00.000Z"),
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        nextSendAt: now,
        status: "active",
      },
      steps,
      new Map(),
      "UTC",
      now,
    );

    expect(schedule[0]?.state).toBe("sending");
  });

  it("marks queued send logs separately from scheduled steps", () => {
    const now = new Date("2026-06-14T12:00:00.000Z");
    const sendLogs = mapLatestSendLogsByStepOrder(steps, [
      {
        campaignStepId: "step-1",
        status: "queued",
        providerMessageId: null,
        sentAt: null,
        scheduledFor: now,
        createdAt: now,
      },
    ]);

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        nextSendAt: now,
        status: "active",
      },
      steps,
      sendLogs,
      "UTC",
      now,
    );

    expect(schedule[0]?.state).toBe("queued");
  });

  it("marks pending schedule steps as paused when enrollment is paused", () => {
    const now = new Date("2026-06-14T10:00:00.000Z");

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 1,
        createdAt: now,
        lastSentAt: null,
        nextSendAt: new Date("2026-06-14T12:00:00.000Z"),
        status: "paused",
      },
      steps,
      new Map(),
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

  it("prefers a confirmed sent log over a newer skipped log for the same step", () => {
    const sentAt = new Date("2026-06-14T12:00:00.000Z");
    const sendLogs = mapLatestSendLogsByStepOrder(steps, [
      {
        campaignStepId: "step-1",
        status: "sent",
        providerMessageId: "msg-1",
        sentAt,
        scheduledFor: sentAt,
        createdAt: sentAt,
      },
      {
        campaignStepId: "step-1",
        status: "skipped",
        providerMessageId: null,
        sentAt: null,
        scheduledFor: sentAt,
        createdAt: new Date("2026-06-14T13:00:00.000Z"),
      },
    ]);

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 2,
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        lastSentAt: sentAt,
        nextSendAt: new Date("2026-06-15T12:00:00.000Z"),
        status: "active",
      },
      steps,
      sendLogs,
      "UTC",
      sentAt,
    );

    expect(schedule[0]?.state).toBe("sent");
  });

  it("shows a deferred retry as scheduled for the current step after a skipped send", () => {
    const attemptedAt = new Date("2026-06-14T12:00:00.000Z");
    const retryAt = new Date("2026-06-15T12:00:00.000Z");
    const now = new Date("2026-06-14T12:05:00.000Z");
    const sendLogs = mapLatestSendLogsByStepOrder(steps, [
      {
        campaignStepId: "step-1",
        status: "skipped",
        providerMessageId: null,
        sentAt: null,
        scheduledFor: attemptedAt,
        createdAt: attemptedAt,
      },
    ]);

    const schedule = buildEnrollmentScheduledSteps(
      {
        ...enrollmentTiming,
        currentStep: 1,
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        lastSentAt: null,
        nextSendAt: retryAt,
        status: "active",
      },
      steps,
      sendLogs,
      "UTC",
      now,
    );

    expect(schedule[0]?.state).toBe("scheduled");
    expect(schedule[0]?.scheduledAt?.toISOString()).toBe(retryAt.toISOString());
  });
});
