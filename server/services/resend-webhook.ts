import "server-only";

import { createEmailEventIdempotent } from "@/server/repositories/email-events";
import {
  applyCampaignSendProviderEvent,
  findCampaignSendByProviderMessageId,
  type CampaignSendProviderEventType,
} from "@/server/repositories/campaign-sends";
import { upsertEmailSuppression } from "@/server/repositories/email-suppressions";
import { findLeadById } from "@/server/repositories/leads";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { Webhook } from "svix";

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    bounce?: { message?: string; type?: string };
    failed?: { reason?: string };
    tags?: Record<string, string>;
  };
};

const EVENT_TYPE_MAP: Record<string, CampaignSendProviderEventType> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.delivery_delayed": "delivery_delayed",
  "email.failed": "failed",
  "email.sent": "sent",
};

export type ResendWebhookProcessResult =
  | { ignored: true; reason: string }
  | { received: true; created: boolean; duplicate: boolean };

function extractProviderError(
  eventType: CampaignSendProviderEventType,
  payload: ResendWebhookPayload,
): string | null {
  if (eventType === "bounced") {
    return payload.data?.bounce?.message?.trim() || payload.data?.bounce?.type || null;
  }

  if (eventType === "failed") {
    return payload.data?.failed?.reason?.trim() || null;
  }

  return null;
}

export function verifyResendWebhookOrThrow(
  rawBody: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
): string | null {
  const env = getEnv();

  if (!env.RESEND_WEBHOOK_SECRET) {
    if (env.NODE_ENV === "production") {
      throw new AppError("FORBIDDEN", "Webhook secret is not configured.", {
        expose: false,
      });
    }

    return headers.svixId;
  }

  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    throw new AppError("FORBIDDEN", "Invalid webhook signature.", { expose: false });
  }

  const webhook = new Webhook(env.RESEND_WEBHOOK_SECRET);

  try {
    webhook.verify(rawBody, {
      "svix-id": headers.svixId,
      "svix-timestamp": headers.svixTimestamp,
      "svix-signature": headers.svixSignature,
    });
  } catch {
    throw new AppError("FORBIDDEN", "Invalid webhook signature.", { expose: false });
  }

  return headers.svixId;
}

export async function processResendWebhookPayload(
  payload: ResendWebhookPayload,
  providerEventId: string | null,
): Promise<ResendWebhookProcessResult> {
  const eventType = payload.type ? EVENT_TYPE_MAP[payload.type] : undefined;

  if (!eventType || !payload.data?.email_id) {
    return { ignored: true, reason: "unsupported_or_incomplete_payload" };
  }

  const send = await findCampaignSendByProviderMessageId(payload.data.email_id);

  if (!send) {
    // Event may arrive before local send commit; acknowledge without failing permanently.
    return { ignored: true, reason: "unknown_provider_email_id" };
  }

  const workspaceId = send.workspaceId;
  const eventTimestamp = new Date(
    payload.data.created_at ?? payload.created_at ?? Date.now(),
  );
  const tags = payload.data.tags ?? {};
  const providerError = extractProviderError(eventType, payload);

  const { created } = await createEmailEventIdempotent(workspaceId, {
    campaignId: send.campaignId,
    campaignStepId: send.campaignStepId,
    contactId: send.leadId,
    emailSendId: send.id,
    providerEventId,
    providerEmailId: payload.data.email_id,
    eventType,
    eventTimestamp,
    rawPayload: payload as Record<string, unknown>,
    metadata: {
      ...tags,
      ...(providerError ? { providerError } : {}),
    },
  });

  if (created) {
    await applyCampaignSendProviderEvent(
      workspaceId,
      send.id,
      eventType,
      eventTimestamp,
      providerError,
    );

    if (eventType === "bounced" || eventType === "complained") {
      let recipientEmail =
        typeof tags.to === "string"
          ? tags.to
          : typeof tags.email === "string"
            ? tags.email
            : null;

      if (!recipientEmail && send.leadId) {
        const lead = await findLeadById(workspaceId, send.leadId);
        recipientEmail = lead?.email ?? null;
      }

      if (recipientEmail && send.leadId) {
        await upsertEmailSuppression(workspaceId, {
          email: recipientEmail,
          contactId: send.leadId,
          reason: eventType === "bounced" ? "hard_bounce" : "complaint",
          source: "webhook",
        });
      }
    }
  }

  return { received: true, created, duplicate: !created };
}
