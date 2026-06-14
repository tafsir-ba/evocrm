import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export type SendCampaignEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendCampaignEmailResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const env = getEnv();

  if (!env.RESEND_API_KEY) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Email sending is not configured.",
      { expose: false },
    );
  }

  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}

export async function sendCampaignEmail(
  input: SendCampaignEmailInput,
): Promise<SendCampaignEmailResult> {
  const env = getEnv();

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { success: false, error: "Email sending is not configured." };
  }

  try {
    const resend = getResendClient();
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: env.EMAIL_REPLY_TO,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message ?? "Resend send failed.",
      };
    }

    const messageId = result.data?.id ?? "unknown";

    return { success: true, messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email send error.";
    return { success: false, error: message };
  }
}

export function buildCampaignEmailHtml(body: string, unsubscribeUrl: string): string {
  const escapedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");

  return `
    <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
      <div>${escapedBody}</div>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e5e5;" />
      <p style="font-size: 12px; color: #666;">
        <a href="${unsubscribeUrl}">Unsubscribe</a> from future campaign emails.
      </p>
    </div>
  `.trim();
}
