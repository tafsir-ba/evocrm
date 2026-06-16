export const CAMPAIGN_EMAIL_VARIABLES = [
  { key: "first_name", label: "First name", token: "{first_name}" },
  { key: "last_name", label: "Last name", token: "{last_name}" },
  { key: "project_name", label: "Project name", token: "{project_name}" },
  { key: "property_name", label: "Property name", token: "{property_name}" },
  { key: "property_url", label: "Property URL", token: "{property_url}" },
  { key: "unsubscribe_url", label: "Unsubscribe URL", token: "{unsubscribe_url}" },
] as const;

export type CampaignEmailVariableKey = (typeof CAMPAIGN_EMAIL_VARIABLES)[number]["key"];

export type CampaignVariableContext = {
  firstName?: string | null;
  lastName?: string | null;
  projectName?: string | null;
  propertyName?: string | null;
  propertyUrl?: string | null;
  unsubscribeUrl?: string | null;
};

export function applyCampaignVariables(
  content: string,
  context: CampaignVariableContext,
): string {
  return content
    .replaceAll("{first_name}", context.firstName ?? "")
    .replaceAll("{last_name}", context.lastName ?? "")
    .replaceAll("{project_name}", context.projectName ?? "")
    .replaceAll("{property_name}", context.propertyName ?? "")
    .replaceAll("{property_url}", context.propertyUrl ?? "")
    .replaceAll("{{unsubscribe_url}}", context.unsubscribeUrl ?? "")
    .replaceAll("{unsubscribe_url}", context.unsubscribeUrl ?? "");
}

export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type HtmlValidationWarning = {
  code: string;
  message: string;
};

const UNSAFE_TAG_PATTERN =
  /<(script|iframe|embed|object|form|input|button|link|meta|base)\b/i;

export function emailBodyHasUnsubscribe(content: string): boolean {
  if (content.includes("{unsubscribe_url}") || content.includes("{{unsubscribe_url}}")) {
    return true;
  }

  if (/<a\b[^>]*href=["'][^"']*unsubscribe/i.test(content)) {
    return true;
  }

  return /https?:\/\/\S*unsubscribe/i.test(content);
}

export function validateCampaignHtml(html: string): HtmlValidationWarning[] {
  const warnings: HtmlValidationWarning[] = [];

  if (!html.trim()) {
    warnings.push({
      code: "missing_body",
      message: "This email does not contain any HTML body content.",
    });
    return warnings;
  }

  const openTags = html.match(/<([a-z][a-z0-9]*)\b[^>]*>/gi) ?? [];
  const closeTags = html.match(/<\/([a-z][a-z0-9]*)\s*>/gi) ?? [];

  if (openTags.length > closeTags.length + 5) {
    warnings.push({
      code: "broken_tags",
      message: "This email may contain broken or unclosed HTML tags.",
    });
  }

  const unsafeMatches = html.match(UNSAFE_TAG_PATTERN);
  if (unsafeMatches) {
    const tags = [...new Set(unsafeMatches.map((tag) => tag.replace(/[<>\/]/g, "").toLowerCase()))];
    warnings.push({
      code: "unsafe_tags",
      message: `This email contains unsupported tags: ${tags.map((tag) => `<${tag}>`).join(", ")}. These may be removed or may not render correctly in email clients.`,
    });
  }

  if (/on\w+\s*=/i.test(html) || /javascript:/i.test(html)) {
    warnings.push({
      code: "unsafe_javascript",
      message: "This email contains inline JavaScript, which is not supported in most email clients.",
    });
  }

  if (!emailBodyHasUnsubscribe(html)) {
    warnings.push({
      code: "missing_unsubscribe",
      message: "Consider including an unsubscribe link using {unsubscribe_url}.",
    });
  }

  const variableTokens = html.match(/\{[a-z_]+\}/gi) ?? [];
  const supported = new Set(CAMPAIGN_EMAIL_VARIABLES.map((item) => item.token));
  const unknown = variableTokens.filter((token) => !supported.has(token as never));

  if (unknown.length > 0) {
    warnings.push({
      code: "unknown_variables",
      message: `This email contains variables that may not be supported: ${[...new Set(unknown)].join(", ")}.`,
    });
  }

  return warnings;
}

const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeCampaignSendTime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : trimmed;
}

export function isValidCampaignSendTime(value: string): boolean {
  return SEND_TIME_PATTERN.test(normalizeCampaignSendTime(value));
}

export function formatStepDelayLabel(
  order: number,
  delayDays: number,
  sendTime: string,
): string {
  if (order === 1 && delayDays === 0) {
    return `Send immediately at ${sendTime}`;
  }

  if (delayDays === 0) {
    return `Send immediately at ${sendTime}`;
  }

  const dayLabel = delayDays === 1 ? "1 day" : `${delayDays} days`;
  return `Wait ${dayLabel}, then send at ${sendTime}`;
}

export function calculateCampaignDayOffset(
  steps: Array<{ order: number; delayDays: number }>,
  targetOrder: number,
): number {
  let total = 0;

  for (const step of steps.filter((item) => item.order <= targetOrder).sort((a, b) => a.order - b.order)) {
    if (step.order === 1) {
      continue;
    }
    total += step.delayDays;
  }

  return total;
}

export function buildCampaignSummary(input: {
  stepCount: number;
  totalDays: number;
  enrollmentLabel: string;
  senderName: string | null;
  senderEmail: string | null;
}): string {
  const sender =
    input.senderName && input.senderEmail
      ? `${input.senderName} <${input.senderEmail}>`
      : "your selected sender";

  const duration =
    input.totalDays === 0
      ? "starting immediately"
      : `over ${input.totalDays} day${input.totalDays === 1 ? "" : "s"}`;

  return `This campaign has ${input.stepCount} email${input.stepCount === 1 ? "" : "s"} ${duration}. It starts when ${input.enrollmentLabel}. Emails will be sent from ${sender}.`;
}
