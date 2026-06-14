import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findStepByOrder: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  findEnrollmentById: vi.fn(),
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
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
  updateCampaignEnrollment,
} from "@/server/repositories/campaign-enrollments";
import { findStepByOrder } from "@/server/repositories/campaign-steps";
import { findLeadById } from "@/server/repositories/leads";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import { updateCampaignEnrollmentForWorkspace } from "@/server/services/campaign-enrollments";
import { IMMEDIATE_SEND_DELAY_MS } from "@/server/utils/campaign-schedule";

const pausedEnrollment = {
  id: "enroll-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  leadId: "lead-1",
  opportunityId: null,
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
      frequency: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findEnrollmentById).mockResolvedValue(pausedEnrollment);
    vi.mocked(findStepByOrder).mockResolvedValue({
      id: "step-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      order: 1,
      delayDays: 0,
      channel: "email",
      subject: "Hello",
      body: "Welcome",
      documentIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      statusId: "s1",
      sourceId: null,
      ownerId: null,
      assignedTo: null,
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      emailNormalized: "jane@example.com",
      phone: null,
      phoneNormalized: null,
      language: null,
      preferredContactMethod: null,
      budgetMin: null,
      budgetMax: null,
      preferredAreas: [],
      notes: null,
      tags: [],
      attributes: {},
      emailConsentStatus: "subscribed",
      emailUnsubscribedAt: null,
      emailUnsubscribeReason: null,
      lastContactedAt: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
