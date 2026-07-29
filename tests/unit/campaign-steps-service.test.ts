import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCampaignStepForWorkspace,
  normalizeStepContent,
  updateCampaignStepForWorkspace,
} from "@/server/services/campaign-steps";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  createCampaignStep: vi.fn(),
  findCampaignStepById: vi.fn(),
  findCampaignSteps: vi.fn(),
  updateCampaignStep: vi.fn(),
}));

vi.mock("@/server/repositories/documents", () => ({
  findDocumentById: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/campaign-enrollments", () => ({
  rescheduleEnrollmentsForCampaignSchedule: vi.fn(),
}));

import { findCampaignById } from "@/server/repositories/campaigns";
import {
  createCampaignStep,
  findCampaignStepById,
  findCampaignSteps,
  updateCampaignStep,
} from "@/server/repositories/campaign-steps";
import { rescheduleEnrollmentsForCampaignSchedule } from "@/server/services/campaign-enrollments";

const campaign = {
  id: "campaign-1",
  workspaceId: "ws-1",
  name: "Test campaign",
  status: "draft" as const,
  audienceType: "leads" as const,
  projectIds: [],
  autoEnrollmentEnabled: false,
  enrollmentTrigger: "manual_only" as const,
  enrollmentRules: { logic: "AND" as const, conditions: [] },
  frequency: null,
  defaultFromName: null,
  senderName: "EvoHome",
  senderEmail: null,
  sendingDomainId: null,
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const readyStep = {
  id: "step-1",
  workspaceId: "ws-1",
  campaignId: "campaign-1",
  order: 1,
  name: "Email 1",
  delayDays: 0,
  delayAmount: 0,
  delayUnit: "days" as const,
  sendTime: "09:00",
  fromName: "EvoHome",
  channel: "email" as const,
  status: "ready" as const,
  contentMode: "plain_text" as const,
  subject: "Hello",
  previewText: null,
  body: "Thanks for joining.\n{unsubscribe_url}",
  bodyHtml: null,
  bodyText: "Thanks for joining.\n{unsubscribe_url}",
  documentIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("campaign step service readiness enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(campaign);
    vi.mocked(findCampaignSteps).mockResolvedValue([readyStep]);
  });

  it("rejects create requests that mark a step ready without unsubscribe support", async () => {
    vi.mocked(createCampaignStep).mockResolvedValue({
      ...readyStep,
      id: "step-new",
      status: "ready",
      body: "Hello only",
      bodyText: "Hello only",
    });

    await expect(
      createCampaignStepForWorkspace("ws-1", "user-1", "campaign-1", {
        order: 1,
        delayDays: 0,
        sendTime: "09:00",
        channel: "email",
        status: "ready",
        subject: "Hello",
        body: "Hello only",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("unsubscribe"),
    });

    expect(createCampaignStep).not.toHaveBeenCalled();
  });

  it("stores an explicit step fromName and falls back to campaign sender name", async () => {
    vi.mocked(findCampaignSteps).mockResolvedValue([]);
    vi.mocked(createCampaignStep).mockResolvedValue({
      ...readyStep,
      id: "step-new",
      status: "draft",
      fromName: "Grosvenor",
    });

    await createCampaignStepForWorkspace("ws-1", "user-1", "campaign-1", {
      order: 1,
      delayDays: 0,
      sendTime: "09:00",
      channel: "email",
      status: "draft",
      fromName: "Grosvenor",
      subject: "Hello",
      body: "Thanks\n{unsubscribe_url}",
    });

    expect(createCampaignStep).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ fromName: "Grosvenor" }),
    );

    vi.mocked(createCampaignStep).mockClear();
    vi.mocked(createCampaignStep).mockResolvedValue({
      ...readyStep,
      id: "step-new-2",
      status: "draft",
      fromName: "EvoHome",
    });

    await createCampaignStepForWorkspace("ws-1", "user-1", "campaign-1", {
      order: 2,
      delayDays: 1,
      sendTime: "09:00",
      channel: "email",
      status: "draft",
      subject: "Follow up",
      body: "Thanks\n{unsubscribe_url}",
    });

    expect(createCampaignStep).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ fromName: "EvoHome" }),
    );
  });

  it("allows send-time-only updates on ready steps without re-validating unsubscribe", async () => {
    vi.mocked(findCampaignStepById).mockResolvedValue(readyStep);
    vi.mocked(updateCampaignStep).mockResolvedValue({
      ...readyStep,
      sendTime: "15:59",
    });

    const updated = await updateCampaignStepForWorkspace(
      "ws-1",
      "user-1",
      "campaign-1",
      "step-1",
      {
        sendTime: "15:59",
        subject: readyStep.subject,
        body: readyStep.body,
        bodyText: readyStep.bodyText,
        contentMode: readyStep.contentMode,
      },
    );

    expect(updated.sendTime).toBe("15:59");
    expect(updateCampaignStep).toHaveBeenCalled();
  });

  it("rejects content edits on ready steps that remove unsubscribe support", async () => {
    vi.mocked(findCampaignStepById).mockResolvedValue(readyStep);

    await expect(
      updateCampaignStepForWorkspace("ws-1", "user-1", "campaign-1", "step-1", {
        body: "Updated body only",
        bodyText: "Updated body only",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("unsubscribe"),
    });

    expect(updateCampaignStep).not.toHaveBeenCalled();
  });

  it("allows schedule-only updates while the campaign is active", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...campaign,
      status: "active",
    });
    vi.mocked(findCampaignStepById).mockResolvedValue(readyStep);
    vi.mocked(updateCampaignStep).mockResolvedValue({
      ...readyStep,
      sendTime: "16:42",
    });

    const updated = await updateCampaignStepForWorkspace(
      "ws-1",
      "user-1",
      "campaign-1",
      "step-1",
      {
        sendTime: "16:42",
        delayDays: readyStep.delayDays,
        subject: readyStep.subject,
        body: readyStep.body,
        bodyText: readyStep.bodyText,
        contentMode: readyStep.contentMode,
      },
    );

    expect(updated.sendTime).toBe("16:42");
    expect(rescheduleEnrollmentsForCampaignSchedule).toHaveBeenCalledWith("ws-1", "campaign-1");
  });

  it("rejects content edits while the campaign is active", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...campaign,
      status: "active",
    });
    vi.mocked(findCampaignStepById).mockResolvedValue(readyStep);

    await expect(
      updateCampaignStepForWorkspace("ws-1", "user-1", "campaign-1", "step-1", {
        subject: "Updated subject",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("Pause this campaign"),
    });

    expect(updateCampaignStep).not.toHaveBeenCalled();
  });
});

describe("normalizeStepContent", () => {
  it("normalizes double-brace variable tokens in stored step content", () => {
    expect(
      normalizeStepContent({
        contentMode: "plain_text",
        body: "Hi {{first_name}}\n{unsubscribe_url}",
      }).body,
    ).toBe("Hi {first_name}\n{unsubscribe_url}");
  });
});
