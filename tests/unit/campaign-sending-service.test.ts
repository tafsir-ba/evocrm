import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findStepByOrder: vi.fn(),
  findNextStepAfterOrder: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  findDueEnrollments: vi.fn(),
  findEnrollmentByIdOnly: vi.fn(),
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  createCampaignSend: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/email/resend", () => ({
  sendCampaignEmail: vi.fn(),
  buildCampaignEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
}));

vi.mock("@/server/utils/unsubscribe-token", () => ({
  createUnsubscribeToken: vi.fn(() => "token"),
  buildUnsubscribeUrl: vi.fn(() => "https://app.test/unsubscribe?token=token"),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { sendCampaignEmail } from "@/server/email/resend";
import { findDueEnrollments, findEnrollmentByIdOnly, updateCampaignEnrollment } from "@/server/repositories/campaign-enrollments";
import { createCampaignSend } from "@/server/repositories/campaign-sends";
import { findNextStepAfterOrder, findStepByOrder } from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { findLeadById } from "@/server/repositories/leads";
import { sendDueCampaignEmails } from "@/server/services/campaign-sending";

const enrollment = {
  id: "enroll-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  leadId: "lead-1",
  opportunityId: null,
  status: "active" as const,
  currentStep: 1,
  nextSendAt: new Date(),
  lastSentAt: null,
  completedAt: null,
  unsubscribedAt: null,
  failedAt: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const step = {
  id: "step-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  order: 1,
  delayDays: 0,
  sendTime: "09:00",
  fromName: "Test Project",
  channel: "email" as const,
  subject: "Hello",
  body: "Welcome",
  documentIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("campaign sending service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDueEnrollments).mockResolvedValue([enrollment]);
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "active",
      audienceType: "leads",
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
      name: "Workspace",
      slug: "demo",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findStepByOrder).mockResolvedValue(step);
    vi.mocked(findNextStepAfterOrder).mockResolvedValue(null);
  });

  it("skips lead missing email and defers retry", async () => {
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
      email: null,
      emailNormalized: null,
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
      emailConsentStatus: "unknown",
      emailUnsubscribedAt: null,
      emailUnsubscribeReason: null,
      lastContactedAt: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "skipped", error: "Lead has no email address." }),
    );
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({ nextSendAt: expect.any(Date) }),
    );
    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });

  it("skips unsubscribed lead", async () => {
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
      emailConsentStatus: "unsubscribed",
      emailUnsubscribedAt: new Date(),
      emailUnsubscribeReason: null,
      lastContactedAt: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "skipped", error: "Lead is unsubscribed." }),
    );
  });

  it("skips send when from name cannot be resolved", async () => {
    vi.mocked(findStepByOrder).mockResolvedValue({
      ...step,
      fromName: "",
    });
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "   ",
      status: "active",
      audienceType: "leads",
      frequency: null,
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
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

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "skipped", error: "Step from name is missing." }),
    );
    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });

  it("uses campaign default from name when step from name is blank", async () => {
    vi.mocked(findStepByOrder).mockResolvedValue({
      ...step,
      fromName: "",
    });
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "active",
      audienceType: "leads",
      frequency: null,
      defaultFromName: "Project X",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
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
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: true,
      messageId: "msg-1",
    });

    await sendDueCampaignEmails(50);

    expect(sendCampaignEmail).toHaveBeenCalledWith(
      expect.objectContaining({ fromName: "Project X" }),
    );
  });

  it("records sent email and advances enrollment", async () => {
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
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: true,
      messageId: "msg-1",
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.sent).toBe(1);
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "sent", providerMessageId: "msg-1" }),
    );
  });

  it("chains consecutive zero-delay steps in one processing run", async () => {
    const step2 = {
      ...step,
      id: "step-2",
      order: 2,
      subject: "Follow-up",
      body: "Second email",
    };

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
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: true,
      messageId: "msg-1",
    });
    vi.mocked(findNextStepAfterOrder)
      .mockResolvedValueOnce(step2)
      .mockResolvedValueOnce(null);
    vi.mocked(findStepByOrder)
      .mockResolvedValueOnce(step)
      .mockResolvedValueOnce(step2);
    vi.mocked(findEnrollmentByIdOnly).mockResolvedValue({
      ...enrollment,
      currentStep: 2,
      lastSentAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.sent).toBe(2);
    expect(summary.processed).toBe(2);
    expect(sendCampaignEmail).toHaveBeenCalledTimes(2);
  });

  it("records failed email and defers retry", async () => {
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
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: false,
      error: "Resend error",
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.failed).toBe(1);
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "failed", error: "Resend error" }),
    );
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({ nextSendAt: expect.any(Date) }),
    );
  });

  it("skips inactive campaign without deferring next send", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "draft",
      audienceType: "leads",
      frequency: null,
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(updateCampaignEnrollment).not.toHaveBeenCalled();
    expect(createCampaignSend).not.toHaveBeenCalled();
  });

  it("skips delayed steps before their scheduled send time", async () => {
    const futureEnrollment = {
      ...enrollment,
      nextSendAt: new Date("2099-01-01T00:00:00.000Z"),
    };

    vi.mocked(findDueEnrollments).mockResolvedValue([futureEnrollment]);
    vi.mocked(findStepByOrder).mockResolvedValue({
      ...step,
      delayDays: 3,
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(createCampaignSend).not.toHaveBeenCalled();
  });

  it("skips paused campaign", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "paused",
      audienceType: "leads",
      frequency: null,
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });
});
