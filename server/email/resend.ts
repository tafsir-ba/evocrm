import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export type SendCampaignEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName: string;
  fromEmail?: string;
  tags?: Array<{ name: string; value: string }>;
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

function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].trim() : from.trim();
}

/** Resend only allows ASCII letters, numbers, underscores, and dashes in tag values. */
export function sanitizeResendTagValue(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.length > 0 ? sanitized : "unknown";
}

export function sanitizeResendTags(
  tags?: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> | undefined {
  if (!tags || tags.length === 0) {
    return tags;
  }

  return tags.map((tag) => ({
    name: sanitizeResendTagValue(tag.name),
    value: sanitizeResendTagValue(tag.value),
  }));
}

function formatFromHeader(fromName: string, emailFrom: string): string {
  const address = extractEmailAddress(emailFrom);
  const safeName = fromName.replace(/["<>]/g, "").trim();
  return `${safeName} <${address}>`;
}

export async function sendCampaignEmail(
  input: SendCampaignEmailInput,
): Promise<SendCampaignEmailResult> {
  const env = getEnv();

  if (!env.RESEND_API_KEY) {
    return { success: false, error: "Email sending is not configured." };
  }

  if (!input.fromEmail && !env.EMAIL_FROM) {
    return { success: false, error: "Email sending is not configured." };
  }

  try {
    const resend = getResendClient();
    const fromAddress = input.fromEmail ?? env.EMAIL_FROM;

    if (!fromAddress) {
      return { success: false, error: "Email sending is not configured." };
    }

    const result = await resend.emails.send({
      from: formatFromHeader(input.fromName, fromAddress),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: env.EMAIL_REPLY_TO,
      tags: sanitizeResendTags(input.tags),
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

export function buildFeedbackResolvedEmailHtml(input: {
  reporterName: string;
  feedbackMessage: string;
  pageUrl?: string | null;
}): string {
  const escapedMessage = input.feedbackMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const pageLink = input.pageUrl
    ? `<p style="margin-top: 16px;"><a href="${input.pageUrl}">Open the page where you reported this</a></p>`
    : "";

  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
      <p>Hello ${input.reporterName.replace(/</g, "&lt;")},</p>
      <p>Thank you again for your feedback.</p>
      <p>We have marked the following item as resolved:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #e5e5e5; color: #333;">
        “${escapedMessage}”
      </blockquote>
      <p>Please test the app again when you have a moment and let us know if the issue is fully resolved on your side.</p>
      <p>If anything is still not working as expected, or if you have any other user need, we remain available.</p>
      ${pageLink}
      <p style="margin-top: 24px;">Best regards,<br />The EvoHome Team</p>
    </div>
  `.trim();
}

export function buildFeedbackResolvedEmailText(input: {
  reporterName: string;
  feedbackMessage: string;
  pageUrl?: string | null;
}): string {
  const lines = [
    `Hello ${input.reporterName},`,
    "",
    "Thank you again for your feedback.",
    "",
    "We have marked the following item as resolved:",
    `"${input.feedbackMessage}"`,
    "",
    "Please test the app again when you have a moment and let us know if the issue is fully resolved on your side.",
    "",
    "If anything is still not working as expected, or if you have any other user need, we remain available.",
  ];

  if (input.pageUrl) {
    lines.push("", `Relevant page: ${input.pageUrl}`);
  }

  lines.push("", "Best regards,", "The EvoHome Team");

  return lines.join("\n");
}

export async function sendFeedbackResolvedEmail(input: {
  to: string;
  reporterName: string;
  feedbackMessage: string;
  pageUrl?: string | null;
}): Promise<SendCampaignEmailResult> {
  return sendCampaignEmail({
    to: input.to,
    subject: "Your feedback has been resolved",
    html: buildFeedbackResolvedEmailHtml(input),
    text: buildFeedbackResolvedEmailText(input),
    fromName: "EvoHome",
  });
}

export function buildCampaignEmailHtml(
  body: string,
  unsubscribeUrl: string,
  options?: { htmlBody?: string | null; previewText?: string | null },
): string {
  const content = options?.htmlBody?.trim()
    ? options.htmlBody
    : body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br />");

  const preview = options?.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;">${options.previewText.replace(/</g, "&lt;")}</div>`
    : "";

  return `
    <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
      ${preview}
      <div>${content}</div>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e5e5;" />
      <p style="font-size: 12px; color: #666;">
        <a href="${unsubscribeUrl}">Unsubscribe</a> from future campaign emails.
      </p>
    </div>
  `.trim();
}
