import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTestLeadRecord,
  campaignRecordExtras,
  campaignStepRecordExtras,
  enrollmentRecordExtras,
} from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findStepByOrder: vi.fn(),
  findCampaignSteps: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  findEnrollmentById: vi.fn(),
  findCampaignEnrollments: vi.fn(),
  listAllCampaignEnrollments: vi.fn(),
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/campaign-sending", () => ({
  sendCampaignEnrollmentsImmediately: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findCampaignById } from "@/server/repositories/campaigns";
import {
  findEnrollmentById,
  findCampaignEnrollments,
  listAllCampaignEnrollments,
  updateCampaignEnrollment,
} from "@/server/repositories/campaign-enrollments";
import { findCampaignSteps, findStepByOrder } from "@/server/repositories/campaign-steps";
import { findLeadById } from "@/server/repositories/leads";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import {
  listCampaignEnrollmentsForWorkspace,
  rescheduleEnrollmentsForCampaignSchedule,
  updateCampaignEnrollmentForWorkspace,
} from "@/server/services/campaign-enrollments";
import { IMMEDIATE_SEND_DELAY_MS } from "@/server/utils/campaign-schedule";

const pausedEnrollment = {
  id: "enroll-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  leadId: "lead-1",
  opportunityId: null,
  ...enrollmentRecordExtras,
  status: "paused" as const,
  currentStep: 1,
  nextSendAt: new Date("2026-06-14T12:00:00.000Z"),
  lastSentAt: null,
  completedAt: null,
  unsubscribedAt: null,
  failedAt: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("campaign enrollment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "active",
      audienceType: "leads",
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findEnrollmentById).mockResolvedValue(pausedEnrollment);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      name: "Workspace",
      slug: "demo",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findCampaignSteps).mockResolvedValue([
      {
        id: "step-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        order: 1,
        delayDays: 0,
        sendTime: "09:00",
        fromName: "Test",
        channel: "email",
        subject: "Hello",
        body: "Welcome",
        documentIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...campaignStepRecordExtras,
      },
    ]);
    vi.mocked(findStepByOrder).mockResolvedValue({
      id: "step-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      order: 1,
      delayDays: 0,
      sendTime: "09:00",
      fromName: "Test",
      channel: "email",
      subject: "Hello",
      body: "Welcome",
      documentIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...campaignStepRecordExtras,
    });
    vi.mocked(findLeadById).mockResolvedValue(buildTestLeadRecord());
    vi.mocked(sendCampaignEnrollmentsImmediately).mockResolvedValue({
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("reschedules overdue enrollment resume and triggers immediate send", async () => {
    const resumedAt = new Date("2026-06-14T13:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(resumedAt);

    vi.mocked(updateCampaignEnrollment)
      .mockResolvedValueOnce({
        ...pausedEnrollment,
        status: "active",
      })
      .mockResolvedValueOnce({
        ...pausedEnrollment,
        status: "active",
        nextSendAt: new Date(resumedAt.getTime() + IMMEDIATE_SEND_DELAY_MS),
      });

    await updateCampaignEnrollmentForWorkspace("ws-1", "user-1", "camp-1", "enroll-1", {
      status: "active",
    });

    expect(updateCampaignEnrollment).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        nextSendAt: new Date(resumedAt.getTime() + IMMEDIATE_SEND_DELAY_MS),
      }),
    );
    expect(sendCampaignEnrollmentsImmediately).toHaveBeenCalledWith(
      "ws-1",
      "camp-1",
      "resume",
      ["enroll-1"],
    );

    vi.useRealTimers();
  });
});

describe("rescheduleEnrollmentsForCampaignSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "CHF",
      type: "agency",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("recalculates nextSendAt for active enrollments when step timing changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T16:40:00.000Z"));

    const createdAt = new Date("2026-06-17T14:00:00.000Z");
    const staleNextSendAt = new Date("2026-06-17T18:37:00.000Z");

    vi.mocked(listAllCampaignEnrollments)
      .mockResolvedValueOnce([
        {
          ...enrollmentRecordExtras,
          id: "enroll-1",
          workspaceId: "ws-1",
          campaignId: "camp-1",
          leadId: "lead-1",
          opportunityId: null,
          status: "active",
          currentStep: 1,
          nextSendAt: staleNextSendAt,
          lastSentAt: null,
          completedAt: null,
          unsubscribedAt: null,
          failedAt: null,
          failureReason: null,
          createdAt,
          updatedAt: createdAt,
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(findStepByOrder).mockResolvedValue({
      id: "step-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      order: 1,
      delayDays: 0,
      sendTime: "16:42",
      fromName: "Test",
      channel: "email",
      subject: "Hello",
      body: "Welcome",
      documentIds: [],
      createdAt,
      updatedAt: createdAt,
      ...campaignStepRecordExtras,
    });

    const updatedIds = await rescheduleEnrollmentsForCampaignSchedule("ws-1", "camp-1");

    expect(updatedIds).toEqual(["enroll-1"]);
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        nextSendAt: new Date("2026-06-17T16:42:00.000Z"),
      }),
    );

    vi.useRealTimers();
  });
});

describe("listCampaignEnrollmentsForWorkspace sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "active",
      audienceType: "leads",
      ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "CHF",
      type: "agency",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "Test Lead",
        firstName: "Test",
        lastName: "Lead",
        email: "lead@example.com",
        emailNormalized: "lead@example.com",
      }),
    );
    vi.mocked(findCampaignSteps).mockResolvedValue([
      {
        id: "step-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        order: 1,
        delayDays: 0,
        sendTime: "09:00",
        fromName: "Test",
        channel: "email",
        subject: "Hello",
        body: "Welcome {unsubscribe_url}",
        documentIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...campaignStepRecordExtras,
      },
    ]);
    vi.mocked(sendCampaignEnrollmentsImmediately).mockResolvedValue({
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("brings forward stale far-future nextSendAt and triggers immediate send", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T15:08:00.000Z"));

    const createdAt = new Date("2026-06-18T15:06:00.000Z");
    const staleNextSendAt = new Date("2026-06-19T15:06:00.000Z");
    const correctedNextSendAt = new Date("2026-06-18T15:09:00.000Z");

    vi.mocked(findCampaignEnrollments).mockResolvedValue({
      enrollments: [
        {
          id: "enroll-1",
          workspaceId: "ws-1",
          campaignId: "camp-1",
          leadId: "lead-1",
          opportunityId: null,
          ...enrollmentRecordExtras,
          status: "active",
          currentStep: 1,
          nextSendAt: staleNextSendAt,
          lastSentAt: null,
          completedAt: null,
          unsubscribedAt: null,
          failedAt: null,
          failureReason: null,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      total: 1,
    });

    vi.mocked(updateCampaignEnrollment).mockResolvedValue({
      id: "enroll-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-1",
      opportunityId: null,
      ...enrollmentRecordExtras,
      status: "active",
      currentStep: 1,
      nextSendAt: correctedNextSendAt,
      lastSentAt: null,
      completedAt: null,
      unsubscribedAt: null,
      failedAt: null,
      failureReason: null,
      createdAt,
      updatedAt: createdAt,
    });

    await listCampaignEnrollmentsForWorkspace("ws-1", "camp-1");

    expect(updateCampaignEnrollment).toHaveBeenCalledWith("ws-1", "enroll-1", {
      nextSendAt: correctedNextSendAt,
    });
    expect(sendCampaignEnrollmentsImmediately).toHaveBeenCalledWith(
      "ws-1",
      "camp-1",
      "enrollment",
      ["enroll-1"],
    );

    vi.useRealTimers();
  });

  it("does not defer an already-due nextSendAt on passive sync", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T15:10:00.000Z"));

    const createdAt = new Date("2026-06-18T15:06:00.000Z");
    const dueNextSendAt = new Date("2026-06-18T15:07:00.000Z");

    vi.mocked(findCampaignEnrollments).mockResolvedValue({
      enrollments: [
        {
          id: "enroll-1",
          workspaceId: "ws-1",
          campaignId: "camp-1",
          leadId: "lead-1",
          opportunityId: null,
          ...enrollmentRecordExtras,
          status: "active",
          currentStep: 1,
          nextSendAt: dueNextSendAt,
          lastSentAt: null,
          completedAt: null,
          unsubscribedAt: null,
          failedAt: null,
          failureReason: null,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      total: 1,
    });

    await listCampaignEnrollmentsForWorkspace("ws-1", "camp-1");

    expect(updateCampaignEnrollment).not.toHaveBeenCalled();
    expect(sendCampaignEnrollmentsImmediately).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
