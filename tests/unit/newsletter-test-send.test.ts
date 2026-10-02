import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  countCampaignSteps: vi.fn(),
  createCampaignStep: vi.fn(),
  findCampaignSteps: vi.fn(),
  findFirstCampaignStep: vi.fn(),
  updateCampaignStep: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  cancelEnrollmentsForCampaign: vi.fn(),
  createCampaignEnrollmentsBulk: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  countCampaignSendsForCampaign: vi.fn(),
}));

vi.mock("@/server/services/newsletter-audience", () => ({
  assertNewsletterAudienceSendable: vi.fn(),
  resolveNewsletterAudience: vi.fn(),
}));

vi.mock("@/server/services/sending-domains", () => ({
  assertVerifiedSenderEmail: vi.fn(),
}));

vi.mock("@/server/services/apply-project-scope", () => ({
  assertMultiProjectRecordAccess: vi.fn(),
}));

vi.mock("@/server/security/newsletter-test-send-rate-limit", () => ({
  assertNewsletterTestSendRateLimit: vi.fn(),
}));

vi.mock("@/server/email/resend", () => ({
  buildCampaignEmailHtml: vi.fn(
    (_body: string, unsubscribeUrl: string, options?: { htmlBody?: string | null }) =>
      `<div>${options?.htmlBody ?? ""}<a href="${unsubscribeUrl}">Unsubscribe</a></div>`,
  ),
  sendCampaignEmail: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/campaigns", () => ({
  enrichCampaign: vi.fn(async (_workspaceId: string, campaign: unknown) => campaign),
}));

import { findCampaignById } from "@/server/repositories/campaigns";
import { findFirstCampaignStep } from "@/server/repositories/campaign-steps";
import {
  cancelEnrollmentsForCampaign,
  createCampaignEnrollmentsBulk,
} from "@/server/repositories/campaign-enrollments";
import { resolveNewsletterAudience } from "@/server/services/newsletter-audience";
import { assertVerifiedSenderEmail } from "@/server/services/sending-domains";
import { assertMultiProjectRecordAccess } from "@/server/services/apply-project-scope";
import { assertNewsletterTestSendRateLimit } from "@/server/security/newsletter-test-send-rate-limit";
import { sendCampaignEmail } from "@/server/email/resend";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { sendNewsletterTestEmailsForWorkspace } from "@/server/services/newsletters";
import { campaignRecordExtras } from "@/tests/helpers/crm-fixtures";
import { AppError } from "@/server/errors";

const newsletter = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Spring update",
  status: "draft" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  kind: "newsletter" as const,
  frequency: null,
  defaultFromName: "Evo Home",
  senderName: "Evo Home",
  senderEmail: "hello@example.com",
  sendingDomainId: "507f1f77bcf86cd799439011",
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stepCount: 1,
  enrollmentCount: 0,
};

const step = {
  id: "step-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  order: 1,
  name: null,
  delayDays: 0,
  delayAmount: 0,
  delayUnit: "days" as const,
  sendTime: "09:00",
  fromName: "Evo Home",
  channel: "email" as const,
  status: "ready" as const,
  contentMode: "html" as const,
  subject: "Hello {first_name}",
  previewText: "A peek for {first_name}",
  body: "Hi {first_name}",
  bodyHtml: "<p>Hi {first_name} from {project_name}</p>",
  bodyText: "Hi {first_name}",
  documentIds: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("sendNewsletterTestEmailsForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(newsletter as never);
    vi.mocked(findFirstCampaignStep).mockResolvedValue(step as never);
    vi.mocked(assertVerifiedSenderEmail).mockResolvedValue(undefined as never);
    vi.mocked(assertMultiProjectRecordAccess).mockResolvedValue(undefined as never);
    vi.mocked(assertNewsletterTestSendRateLimit).mockReturnValue(undefined as never);
    vi.mocked(sendCampaignEmail).mockResolvedValue({
      success: true,
      messageId: "msg-1",
    });
    vi.mocked(createAuditLog).mockResolvedValue(undefined as never);
  });

  it("sends rendered test emails with [Test] subject and sample merge fields", async () => {
    const result = await sendNewsletterTestEmailsForWorkspace(
      "ws-1",
      "user-1",
      "camp-1",
      ["ada@example.com", "bob@example.com"],
    );

    expect(result.sent).toBe(2);
    expect(sendCampaignEmail).toHaveBeenCalledTimes(2);
    expect(sendCampaignEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "[Test] Hello Alex",
        fromName: "Evo Home",
        fromEmail: "hello@example.com",
        html: expect.stringContaining("Hi Alex from Sample project"),
        tags: expect.arrayContaining([
          { name: "newsletter_test", value: "true" },
        ]),
      }),
    );
    expect(assertVerifiedSenderEmail).toHaveBeenCalledWith(
      "ws-1",
      newsletter.sendingDomainId,
      newsletter.senderEmail,
    );
    expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      newsletter.projectIds,
      "campaign:update",
    );
    expect(assertNewsletterTestSendRateLimit).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      2,
    );
    const auditCall = vi.mocked(createAuditLog).mock.calls[0]?.[0] as {
      after: Record<string, unknown>;
    };
    expect(auditCall.after).toMatchObject({
      recipientCount: 2,
      messageIds: ["msg-1", "msg-1"],
    });
    expect(auditCall.after).not.toHaveProperty("recipients");
  });

  it("does not snapshot audience or create enrollments", async () => {
    await sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
      "ada@example.com",
    ]);

    expect(resolveNewsletterAudience).not.toHaveBeenCalled();
    expect(createCampaignEnrollmentsBulk).not.toHaveBeenCalled();
    expect(cancelEnrollmentsForCampaign).not.toHaveBeenCalled();
  });

  it("allows test send while audience is locked without cancelling enrollments", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      status: "active",
      audienceLockedAt: new Date("2026-10-01T10:00:00.000Z"),
      scheduledFor: new Date("2026-10-03T09:00:00.000Z"),
    } as never);

    await sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
      "ada@example.com",
    ]);

    expect(sendCampaignEmail).toHaveBeenCalledTimes(1);
    expect(resolveNewsletterAudience).not.toHaveBeenCalled();
    expect(createCampaignEnrollmentsBulk).not.toHaveBeenCalled();
    expect(cancelEnrollmentsForCampaign).not.toHaveBeenCalled();
  });

  it("rejects when project scope denies access", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      projectIds: ["507f1f77bcf86cd799439011"],
    } as never);
    vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "You do not have access to this project."),
    );

    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
      ]),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    expect(sendCampaignEmail).not.toHaveBeenCalled();
    expect(assertNewsletterTestSendRateLimit).not.toHaveBeenCalled();
  });

  it("explains empty projectIds denial for grant-only callers", async () => {
    vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "You do not have access to this record."),
    );

    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
      ]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/audience project/i),
    });

    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });

  it("rejects drip campaigns", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      kind: "drip",
    } as never);

    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
      ]),
    ).rejects.toBeInstanceOf(AppError);

    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });

  it("requires content and verified sender", async () => {
    vi.mocked(findFirstCampaignStep).mockResolvedValue(null as never);
    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
      ]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/content/i),
    });

    vi.mocked(findFirstCampaignStep).mockResolvedValue(step as never);
    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      sendingDomainId: null,
      senderEmail: null,
    } as never);

    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
      ]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/sending domain/i),
    });
  });

  it("surfaces partial send failures without creating enrollments", async () => {
    vi.mocked(sendCampaignEmail)
      .mockResolvedValueOnce({ success: true, messageId: "msg-1" })
      .mockResolvedValueOnce({ success: false, error: "Resend failed." });

    await expect(
      sendNewsletterTestEmailsForWorkspace("ws-1", "user-1", "camp-1", [
        "ada@example.com",
        "bob@example.com",
      ]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/Sent 1 test email/i),
      details: expect.objectContaining({
        sent: 1,
        failedAt: "bob@example.com",
      }),
    });

    expect(createCampaignEnrollmentsBulk).not.toHaveBeenCalled();
    expect(cancelEnrollmentsForCampaign).not.toHaveBeenCalled();
  });
});
