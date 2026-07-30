import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/email-events", () => ({
  createEmailEventIdempotent: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  findCampaignSendByProviderMessageId: vi.fn(),
  applyCampaignSendProviderEvent: vi.fn(),
}));

vi.mock("@/server/repositories/email-suppressions", () => ({
  upsertEmailSuppression: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NODE_ENV: "test",
    RESEND_WEBHOOK_SECRET: undefined,
  })),
}));

import { createEmailEventIdempotent } from "@/server/repositories/email-events";
import {
  applyCampaignSendProviderEvent,
  findCampaignSendByProviderMessageId,
} from "@/server/repositories/campaign-sends";
import { upsertEmailSuppression } from "@/server/repositories/email-suppressions";
import { findLeadById } from "@/server/repositories/leads";
import { processResendWebhookPayload } from "@/server/services/resend-webhook";

describe("resend webhook processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores unknown provider email ids without throwing", async () => {
    vi.mocked(findCampaignSendByProviderMessageId).mockResolvedValue(null);

    const result = await processResendWebhookPayload(
      {
        type: "email.delivered",
        data: { email_id: "missing", created_at: "2026-07-30T12:00:00.000Z" },
      },
      "svix_1",
    );

    expect(result).toEqual({
      ignored: true,
      reason: "unknown_provider_email_id",
    });
    expect(createEmailEventIdempotent).not.toHaveBeenCalled();
  });

  it("stores events idempotently and updates send first-touch fields once", async () => {
    vi.mocked(findCampaignSendByProviderMessageId).mockResolvedValue({
      id: "send-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      campaignStepId: "step-1",
      enrollmentId: "enroll-1",
      leadId: "lead-1",
      opportunityId: null,
      status: "sent",
      providerMessageId: "re_123",
      error: null,
      scheduledFor: new Date(),
      sentAt: new Date(),
      deliveredAt: null,
      firstOpenedAt: null,
      firstClickedAt: null,
      bouncedAt: null,
      complainedAt: null,
      deliveryDelayedAt: null,
      providerFailedAt: null,
      providerError: null,
      lastProviderEventAt: null,
      createdAt: new Date(),
    });
    vi.mocked(createEmailEventIdempotent).mockResolvedValue({
      created: true,
      event: {
        id: "evt-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-1",
        contactId: "lead-1",
        emailSendId: "send-1",
        provider: "resend",
        providerEventId: "svix_1",
        providerEmailId: "re_123",
        eventType: "opened",
        eventTimestamp: new Date("2026-07-30T12:00:00.000Z"),
        rawPayload: null,
        metadata: null,
        createdAt: new Date(),
      },
    });

    const first = await processResendWebhookPayload(
      {
        type: "email.opened",
        data: { email_id: "re_123", created_at: "2026-07-30T12:00:00.000Z" },
      },
      "svix_1",
    );

    expect(first).toEqual({ received: true, created: true, duplicate: false });
    expect(applyCampaignSendProviderEvent).toHaveBeenCalledWith(
      "ws-1",
      "send-1",
      "opened",
      new Date("2026-07-30T12:00:00.000Z"),
      null,
    );

    vi.mocked(createEmailEventIdempotent).mockResolvedValue({
      created: false,
      event: {
        id: "evt-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-1",
        contactId: "lead-1",
        emailSendId: "send-1",
        provider: "resend",
        providerEventId: "svix_1",
        providerEmailId: "re_123",
        eventType: "opened",
        eventTimestamp: new Date("2026-07-30T12:00:00.000Z"),
        rawPayload: null,
        metadata: null,
        createdAt: new Date(),
      },
    });

    vi.mocked(applyCampaignSendProviderEvent).mockClear();

    const second = await processResendWebhookPayload(
      {
        type: "email.opened",
        data: { email_id: "re_123", created_at: "2026-07-30T12:00:00.000Z" },
      },
      "svix_1",
    );

    expect(second).toEqual({ received: true, created: false, duplicate: true });
    expect(applyCampaignSendProviderEvent).not.toHaveBeenCalled();
  });

  it("suppresses bounced recipients using lead email fallback", async () => {
    vi.mocked(findCampaignSendByProviderMessageId).mockResolvedValue({
      id: "send-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      campaignStepId: "step-1",
      enrollmentId: "enroll-1",
      leadId: "lead-1",
      opportunityId: null,
      status: "sent",
      providerMessageId: "re_123",
      error: null,
      scheduledFor: new Date(),
      sentAt: new Date(),
      deliveredAt: null,
      firstOpenedAt: null,
      firstClickedAt: null,
      bouncedAt: null,
      complainedAt: null,
      deliveryDelayedAt: null,
      providerFailedAt: null,
      providerError: null,
      lastProviderEventAt: null,
      createdAt: new Date(),
    });
    vi.mocked(createEmailEventIdempotent).mockResolvedValue({
      created: true,
      event: {
        id: "evt-2",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        campaignStepId: "step-1",
        contactId: "lead-1",
        emailSendId: "send-1",
        provider: "resend",
        providerEventId: "svix_bounce",
        providerEmailId: "re_123",
        eventType: "bounced",
        eventTimestamp: new Date("2026-07-30T12:05:00.000Z"),
        rawPayload: null,
        metadata: null,
        createdAt: new Date(),
      },
    });
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      email: "person@example.com",
    } as never);

    await processResendWebhookPayload(
      {
        type: "email.bounced",
        data: {
          email_id: "re_123",
          created_at: "2026-07-30T12:05:00.000Z",
          bounce: { message: "mailbox full" },
        },
      },
      "svix_bounce",
    );

    expect(upsertEmailSuppression).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        email: "person@example.com",
        reason: "hard_bounce",
        source: "webhook",
      }),
    );
  });
});
