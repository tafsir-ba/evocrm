import { handleRouteError, successResponse } from "@/server/api/responses";
import { createEmailEvent } from "@/server/repositories/email-events";
import { upsertEmailSuppression } from "@/server/repositories/email-suppressions";
import { findCampaignSendByProviderMessageId } from "@/server/repositories/campaign-sends";
import { findLeadById } from "@/server/repositories/leads";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    tags?: Record<string, string>;
  };
};

const EVENT_TYPE_MAP: Record<string, "delivered" | "bounced" | "complained" | "opened" | "clicked" | "delivery_delayed" | "failed" | "sent"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.delivery_delayed": "delivery_delayed",
  "email.failed": "failed",
  "email.sent": "sent",
};

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const signature = request.headers.get("svix-signature");

    if (env.RESEND_WEBHOOK_SECRET && !signature) {
      throw new AppError("FORBIDDEN", "Invalid webhook signature.", { expose: false });
    }

    const payload = (await request.json()) as ResendWebhookPayload;
    const eventType = payload.type ? EVENT_TYPE_MAP[payload.type] : undefined;

    if (!eventType || !payload.data?.email_id) {
      return successResponse({ ignored: true });
    }

    const send = await findCampaignSendByProviderMessageId(payload.data.email_id);

    if (!send) {
      return successResponse({ ignored: true });
    }

    const tags = payload.data.tags ?? {};
    const workspaceId = send.workspaceId;

    await createEmailEvent(workspaceId, {
      campaignId: send.campaignId,
      campaignStepId: send.campaignStepId,
      contactId: send.leadId,
      emailSendId: send.id,
      providerEventId: payload.type ?? null,
      providerEmailId: payload.data.email_id,
      eventType,
      eventTimestamp: new Date(payload.data.created_at ?? payload.created_at ?? Date.now()),
      rawPayload: payload as Record<string, unknown>,
      metadata: tags,
    });

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

    return successResponse({ received: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
