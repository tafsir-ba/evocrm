import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  campaignRecordExtras,
  campaignStepRecordExtras,
  enrollmentRecordExtras,
  leadRecordExtras,
} from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findStepByOrder: vi.fn(),
  findNextStepAfterOrder: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  claimEnrollmentForSend: vi.fn(),
  findActiveEnrollmentsByIds: vi.fn(),
  findDueEnrollments: vi.fn(),
  findEnrollmentByIdOnly: vi.fn(),
  listAllCampaignEnrollments: vi.fn(),
  releaseEnrollmentSendClaim: vi.fn(),
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  createCampaignSend: vi.fn(),
  findSentCampaignSendForEnrollmentStep: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/email-suppressions", () => ({
  findSuppressionByEmail: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/opportunities", () => ({
  findOpportunityById: vi.fn(),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: vi.fn(),
}));

vi.mock("@/server/services/campaign-enrollment-reconcile", () => ({
  reconcileEnrollmentBeforeSend: vi.fn(async (_workspaceId, enrollment) => enrollment),
}));

vi.mock("@/server/services/sending-domains", () => ({
  assertVerifiedSenderEmail: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/email/resend", () => ({
  sendCampaignEmail: vi.fn(),
  buildCampaignEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
}));

vi.mock("@/server/services/campaign-email-attachments", () => ({
  loadCampaignEmailAttachments: vi.fn(async () => ({ ok: true, attachments: [] })),
}));

vi.mock("@/server/utils/unsubscribe-token", () => ({
  createUnsubscribeToken: vi.fn(() => "token"),
  buildUnsubscribeUrl: vi.fn(() => "https://app.test/unsubscribe?token=token"),
  buildOneClickUnsubscribeUrl: vi.fn(
    () => "https://app.test/api/unsubscribe?token=token",
  ),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { sendCampaignEmail } from "@/server/email/resend";
import {
  claimEnrollmentForSend,
  findActiveEnrollmentsByIds,
  findDueEnrollments,
  findEnrollmentByIdOnly,
  listAllCampaignEnrollments,
  releaseEnrollmentSendClaim,
  updateCampaignEnrollment,
} from "@/server/repositories/campaign-enrollments";
import { createCampaignSend, findSentCampaignSendForEnrollmentStep } from "@/server/repositories/campaign-sends";
import { findNextStepAfterOrder, findStepByOrder } from "@/server/repositories/campaign-steps";
import { findCampaignById } from "@/server/repositories/campaigns";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { findLeadById } from "@/server/repositories/leads";
import { findSuppressionByEmail } from "@/server/repositories/email-suppressions";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";
import {
  sendCampaignEnrollmentsImmediately,
  sendDueCampaignEmails,
} from "@/server/services/campaign-sending";

const enrollment = {
  id: "enroll-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  leadId: "lead-1",
  opportunityId: null,
  ...enrollmentRecordExtras,
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
  ...campaignStepRecordExtras,
};

describe("campaign sending service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findSuppressionByEmail).mockResolvedValue(null);
    vi.mocked(assertVerifiedSenderEmail).mockResolvedValue({
      id: "domain-1",
      workspaceId: "ws-1",
      domain: "example.com",
      provider: "resend",
      providerDomainId: "provider-domain-1",
      status: "verified",
      spfStatus: "valid",
      dkimStatus: "valid",
      dmarcStatus: "valid",
      defaultSenderEmail: "test@example.com",
      dnsRecords: [],
      lastCheckedAt: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findDueEnrollments).mockResolvedValue([enrollment]);
    vi.mocked(claimEnrollmentForSend).mockResolvedValue(enrollment);
    vi.mocked(findSentCampaignSendForEnrollmentStep).mockResolvedValue(null);
    vi.mocked(releaseEnrollmentSendClaim).mockResolvedValue(undefined);
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Test",
      status: "active",
      audienceType: "leads",
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      senderName: "Test Project",
      senderEmail: "test@example.com",
      sendingDomainId: "domain-1",
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
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
      name: "Grosvenor Vistas website contact form dripping",
      status: "active",
      audienceType: "leads",
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      senderName: null,
      senderEmail: "test@example.com",
      sendingDomainId: "domain-1",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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

  it("uses campaign sender name when step from name was baked as the campaign title", async () => {
    vi.mocked(findStepByOrder).mockResolvedValue({
      ...step,
      fromName: "Grosvenor Vistas website contact form dripping",
    });
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Grosvenor Vistas website contact form dripping",
      status: "active",
      audienceType: "leads",
      ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      senderName: "Grosvenor",
      senderEmail: "hello@example.com",
      sendingDomainId: "domain-1",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      ...leadRecordExtras,
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
      propertyTypeInterests: [],
      transactionIntent: null,
      usagePurpose: null,
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
      messageId: "msg-legacy-from",
    });

    await sendDueCampaignEmails(50);

    expect(sendCampaignEmail).toHaveBeenCalledWith(
      expect.objectContaining({ fromName: "Grosvenor" }),
    );
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
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: "Project X",
      senderName: null,
      senderEmail: "hello@example.com",
      sendingDomainId: "domain-1",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
    expect(summary.deferred).toBe(0);
    expect(sendCampaignEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "List-Unsubscribe": "<https://app.test/api/unsubscribe?token=token>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    );
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "sent", providerMessageId: "msg-1" }),
    );
  });

  it("does not chain zero-delay steps when the next step is scheduled in the future", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T17:28:00.000Z"));

    const step2 = {
      ...step,
      id: "step-2",
      order: 2,
      subject: "Follow-up",
      body: "Second email",
      sendTime: "17:30",
    };

    vi.mocked(findDueEnrollments).mockResolvedValue([
      {
        ...enrollment,
        nextSendAt: new Date("2026-06-14T17:28:00.000Z"),
      },
    ]);
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
      nextSendAt: new Date("2026-06-14T17:30:00.000Z"),
      lastSentAt: new Date("2026-06-14T17:28:00.000Z"),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.sent).toBe(1);
    expect(summary.processed).toBe(1);
    expect(sendCampaignEmail).toHaveBeenCalledTimes(1);
  });

  it("records failed email and defers retry", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
  ...leadRecordExtras,
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
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
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
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      senderName: "Test Project",
      senderEmail: "test@example.com",
      sendingDomainId: "domain-1",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        status: "failed",
        failureReason: "Campaign is draft and cannot send.",
      }),
    );
    expect(createCampaignSend).not.toHaveBeenCalled();
  });

  it("fails enrollment permanently when recipient is hard-bounce suppressed", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      ...leadRecordExtras,
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
      propertyTypeInterests: [],
      transactionIntent: null,
      usagePurpose: null,
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
    vi.mocked(findSuppressionByEmail).mockResolvedValue({
      id: "supp-1",
      workspaceId: "ws-1",
      contactId: "lead-1",
      email: "jane@example.com",
      reason: "hard_bounce",
      source: "webhook",
      notes: null,
      createdAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(createCampaignSend).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        status: "skipped",
        error: "Recipient is suppressed (hard_bounce).",
      }),
    );
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        status: "failed",
        failureReason: "Recipient is suppressed (hard_bounce).",
      }),
    );
    // Must not defer — that caused infinite daily skip loops.
    expect(updateCampaignEnrollment).not.toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({ nextSendAt: expect.any(Date) }),
    );
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
  ...campaignRecordExtras,
      frequency: null,
      defaultFromName: null,
      senderName: "Test Project",
      senderEmail: "test@example.com",
      sendingDomainId: "domain-1",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await sendDueCampaignEmails(50);

    expect(summary.skipped).toBe(1);
    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({ status: "paused" }),
    );
  });

  it("caps immediate activation sends and defers the rest for cron", async () => {
    const dueEnrollments = Array.from({ length: 3 }, (_, index) => ({
      ...enrollment,
      id: `enroll-${index + 1}`,
      leadId: `lead-${index + 1}`,
      nextSendAt: new Date(Date.now() - (3 - index) * 1000),
    }));

    vi.mocked(listAllCampaignEnrollments).mockResolvedValue(dueEnrollments);
    vi.mocked(findActiveEnrollmentsByIds).mockResolvedValue(dueEnrollments);
    vi.mocked(claimEnrollmentForSend).mockImplementation(
      async (_workspaceId, enrollmentId) =>
        dueEnrollments.find((item) => item.id === enrollmentId) ?? null,
    );
    vi.mocked(findLeadById).mockImplementation(async (_workspaceId, leadId) => ({
      id: leadId,
      workspaceId: "ws-1",
      ...leadRecordExtras,
      statusId: "s1",
      sourceId: null,
      ownerId: null,
      assignedTo: null,
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
      email: `${leadId}@example.com`,
      emailNormalized: `${leadId}@example.com`,
      phone: null,
      phoneNormalized: null,
      language: null,
      preferredContactMethod: null,
      budgetMin: null,
      budgetMax: null,
      preferredAreas: [],
      propertyTypeInterests: [],
      transactionIntent: null,
      usagePurpose: null,
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
    }));
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: true,
      messageId: "msg-batch",
    });
    vi.mocked(findNextStepAfterOrder).mockResolvedValue(null);

    const summary = await sendCampaignEnrollmentsImmediately(
      "ws-1",
      "camp-1",
      "activation",
      undefined,
      2,
    );

    expect(summary.sent).toBe(2);
    expect(summary.deferred).toBe(1);
    expect(sendCampaignEmail).toHaveBeenCalledTimes(2);
  });

  it("stops zero-delay chaining when the email budget is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T17:30:00.000Z"));

    const step2 = {
      ...step,
      id: "step-2",
      order: 2,
      subject: "Follow-up",
      body: "Second email",
      delayDays: 0,
      sendTime: "17:30",
    };

    vi.mocked(findDueEnrollments).mockResolvedValue([
      {
        ...enrollment,
        nextSendAt: new Date("2026-06-14T17:30:00.000Z"),
      },
    ]);
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      ...leadRecordExtras,
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
      propertyTypeInterests: [],
      transactionIntent: null,
      usagePurpose: null,
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
      messageId: "msg-budget",
    });
    vi.mocked(findNextStepAfterOrder).mockResolvedValue(step2);
    vi.mocked(findStepByOrder)
      .mockResolvedValueOnce(step)
      .mockResolvedValueOnce(step2);
    vi.mocked(findEnrollmentByIdOnly).mockResolvedValue({
      ...enrollment,
      currentStep: 2,
      nextSendAt: new Date("2026-06-14T17:30:00.000Z"),
      lastSentAt: new Date("2026-06-14T17:30:00.000Z"),
    });

    const summary = await sendDueCampaignEmails(1);

    expect(summary.sent).toBe(1);
    expect(sendCampaignEmail).toHaveBeenCalledTimes(1);
    expect(updateCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      "enroll-1",
      expect.objectContaining({
        currentStep: 2,
      }),
    );
  });
});
