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
import { isPermanentResendBounce } from "@/server/utils/resend-bounce";
import { Webhook } from "svix";

type ResendWebhookTags =
  | Record<string, string>
  | Array<{ name?: string; value?: string }>;

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
    tags?: ResendWebhookTags;
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
  | { retry: true; reason: string }
  | { received: true; created: boolean; duplicate: boolean };

function normalizeWebhookTags(tags: ResendWebhookTags | undefined): Record<string, string> {
  if (!tags) {
    return {};
  }

  if (Array.isArray(tags)) {
    const out: Record<string, string> = {};
    for (const tag of tags) {
      if (tag?.name && typeof tag.value === "string") {
        out[tag.name] = tag.value;
      }
    }
    return out;
  }

  return tags;
}

/** Campaign sends always attach campaign_id (see campaign-sending tags). */
function isCampaignTaggedEmail(tags: Record<string, string>): boolean {
  return Boolean(tags.campaign_id);
}

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
  const tags = normalizeWebhookTags(payload.data.tags);

  if (!send) {
    // Campaign emails can race ahead of CampaignSend insert. Ask the provider to
    // retry. Non-campaign Resend traffic (invites, feedback, etc.) is ignored.
    if (isCampaignTaggedEmail(tags)) {
      return { retry: true, reason: "unknown_provider_email_id" };
    }

    return { ignored: true, reason: "unknown_provider_email_id" };
  }

  const workspaceId = send.workspaceId;
  const eventTimestamp = new Date(
    payload.data.created_at ?? payload.created_at ?? Date.now(),
  );
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

    if (eventType === "complained") {
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
          reason: "complaint",
          source: "webhook",
        });
      }
    }

    // Soft/transient bounces (mailbox full, temporary DNS) must not permanently
    // suppress — that blocked Grosvenor Vistas drip retries for recoverable addresses.
    if (eventType === "bounced" && isPermanentResendBounce(payload.data?.bounce)) {
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
          reason: "hard_bounce",
          source: "webhook",
        });
      }
    }
  }

  return { received: true, created, duplicate: !created };
}
