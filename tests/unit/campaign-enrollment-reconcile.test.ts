import { beforeEach, describe, expect, it, vi } from "vitest";

import { enrollmentRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findCampaignSteps: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  findCampaignSendsByEnrollmentIds: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

import { updateCampaignEnrollment } from "@/server/repositories/campaign-enrollments";
import { findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findCampaignSendsByEnrollmentIds } from "@/server/repositories/campaign-sends";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { reconcileEnrollmentBeforeSend } from "@/server/services/campaign-enrollment-reconcile";

describe("campaign enrollment reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "Europe/Zurich",
      defaultCurrency: "CHF",
      type: "agency",
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
        sendTime: "20:37",
        fromName: "Test",
        channel: "email",
        subject: "test 1",
        body: "Welcome",
        documentIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        name: "Step 1",
        delayAmount: 0,
        delayUnit: "days",
        status: "ready",
        contentMode: "plain_text",
        previewText: null,
        bodyHtml: null,
        bodyText: null,
      },
      {
        id: "step-2",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        order: 2,
        delayDays: 0,
        sendTime: "20:40",
        fromName: "Test",
        channel: "email",
        subject: "test 2",
        body: "Welcome",
        documentIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        name: "Step 2",
        delayAmount: 0,
        delayUnit: "days",
        status: "ready",
        contentMode: "plain_text",
        previewText: null,
        bodyHtml: null,
        bodyText: null,
      },
    ]);
  });

  it("rewinds currentStep before send when enrollment advanced past unsent steps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T18:39:00.000Z"));

    const enrollment = {
      id: "enroll-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-1",
      opportunityId: null,
      ...enrollmentRecordExtras,
      status: "active" as const,
      currentStep: 2,
      nextSendAt: new Date("2026-06-18T18:40:00.000Z"),
      lastSentAt: new Date("2026-06-18T18:37:00.000Z"),
      completedAt: null,
      unsubscribedAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: new Date("2026-06-18T18:30:00.000Z"),
      updatedAt: new Date("2026-06-18T18:30:00.000Z"),
    };

    vi.mocked(findCampaignSendsByEnrollmentIds).mockResolvedValue([
      {
        id: "send-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-1",
        enrollmentId: "enroll-1",
        leadId: "lead-1",
        opportunityId: null,
        status: "sent",
        providerMessageId: "msg-1",
        error: null,
        scheduledFor: new Date("2026-06-18T18:37:00.000Z"),
        sentAt: new Date("2026-06-18T18:37:00.000Z"),
        createdAt: new Date("2026-06-18T18:37:00.000Z"),
      },
    ]);

    await reconcileEnrollmentBeforeSend("ws-1", enrollment);

    expect(updateCampaignEnrollment).not.toHaveBeenCalled();

    vi.mocked(updateCampaignEnrollment).mockResolvedValue({
      ...enrollment,
      currentStep: 2,
      nextSendAt: new Date("2026-06-18T18:40:00.000Z"),
    });

    await reconcileEnrollmentBeforeSend("ws-1", {
      ...enrollment,
      currentStep: 3,
      nextSendAt: new Date("2026-06-18T18:45:00.000Z"),
    });

    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        currentStep: 2,
        completedAt: null,
      }),
    );

    vi.useRealTimers();
  });

  it("marks active enrollments completed when every step has a confirmed send", async () => {
    const sentAt = new Date("2026-06-18T18:37:00.000Z");
    const enrollment = {
      id: "enroll-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-1",
      opportunityId: null,
      ...enrollmentRecordExtras,
      status: "active" as const,
      currentStep: 2,
      nextSendAt: sentAt,
      lastSentAt: sentAt,
      completedAt: null,
      unsubscribedAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: new Date("2026-06-18T18:30:00.000Z"),
      updatedAt: new Date("2026-06-18T18:30:00.000Z"),
    };

    vi.mocked(findCampaignSendsByEnrollmentIds).mockResolvedValue([
      {
        id: "send-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-1",
        enrollmentId: "enroll-1",
        leadId: "lead-1",
        opportunityId: null,
        status: "sent",
        providerMessageId: "msg-1",
        error: null,
        scheduledFor: sentAt,
        sentAt,
        createdAt: sentAt,
      },
      {
        id: "send-2",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-2",
        enrollmentId: "enroll-1",
        leadId: "lead-1",
        opportunityId: null,
        status: "sent",
        providerMessageId: "msg-2",
        error: null,
        scheduledFor: sentAt,
        sentAt,
        createdAt: sentAt,
      },
    ]);

    vi.mocked(updateCampaignEnrollment).mockResolvedValue({
      ...enrollment,
      status: "completed",
      completedAt: sentAt,
      lastSentAt: sentAt,
    });

    await reconcileEnrollmentBeforeSend("ws-1", enrollment);

    expect(updateCampaignEnrollment).toHaveBeenCalledWith("ws-1", "enroll-1", {
      status: "completed",
      completedAt: sentAt,
      lastSentAt: sentAt,
      sendClaimExpiresAt: null,
    });
  });
});
