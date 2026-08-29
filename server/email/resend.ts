import "server-only";

import { Resend } from "resend";

import { buildCampaignEmailHtml as buildCampaignEmailHtmlShared } from "@/lib/campaign-email";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export { buildCampaignEmailHtmlShared as buildCampaignEmailHtml };

export type SendCampaignEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendCampaignEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName: string;
  fromEmail?: string;
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
  attachments?: SendCampaignEmailAttachment[];
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

function isResendRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("rate_limit") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const RESEND_RATE_LIMIT_RETRIES = 2;

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

    const payload = {
      from: formatFromHeader(input.fromName, fromAddress),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: env.EMAIL_REPLY_TO,
      tags: sanitizeResendTags(input.tags),
      ...(input.headers && Object.keys(input.headers).length > 0
        ? { headers: input.headers }
        : {}),
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
            })),
          }
        : {}),
    };

    let lastError = "Resend send failed.";

    for (let attempt = 0; attempt <= RESEND_RATE_LIMIT_RETRIES; attempt += 1) {
      const result = await resend.emails.send(payload);

      if (!result.error) {
        const messageId = result.data?.id?.trim();
        if (!messageId) {
          return {
            success: false,
            error: "Resend returned no message id.",
          };
        }
        return { success: true, messageId };
      }

      lastError = result.error.message ?? "Resend send failed.";

      if (
        attempt < RESEND_RATE_LIMIT_RETRIES &&
        isResendRateLimitError(lastError)
      ) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      return { success: false, error: lastError };
    }

    return { success: false, error: lastError };
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
  category?: "bug" | "idea" | "other";
}): string {
  const escapedMessage = input.feedbackMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const pageLink = input.pageUrl
    ? `<p style="margin-top: 16px;"><a href="${input.pageUrl}">Open the page where you reported this</a></p>`
    : "";

  const isBug = input.category === "bug";
  const intro = isBug
    ? "We have solved the bug you reported:"
    : "We have marked the following item as resolved:";
  const thanks = isBug
    ? "Thank you again for reporting this bug."
    : "Thank you again for your feedback.";

  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
      <p>Hello ${input.reporterName.replace(/</g, "&lt;")},</p>
      <p>${thanks}</p>
      <p>${intro}</p>
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
  category?: "bug" | "idea" | "other";
}): string {
  const isBug = input.category === "bug";
  const lines = [
    `Hello ${input.reporterName},`,
    "",
    isBug
      ? "Thank you again for reporting this bug."
      : "Thank you again for your feedback.",
    "",
    isBug
      ? "We have solved the bug you reported:"
      : "We have marked the following item as resolved:",
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
  category?: "bug" | "idea" | "other";
}): Promise<SendCampaignEmailResult> {
  const isBug = input.category === "bug";

  return sendCampaignEmail({
    to: input.to,
    subject: isBug ? "Your bug has been solved" : "Your feedback has been resolved",
    html: buildFeedbackResolvedEmailHtml(input),
    text: buildFeedbackResolvedEmailText(input),
    fromName: "EvoHome",
  });
}
