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

const CAMPAIGN_VARIABLE_CONTEXT_KEYS: Record<
  CampaignEmailVariableKey,
  keyof CampaignVariableContext
> = {
  first_name: "firstName",
  last_name: "lastName",
  project_name: "projectName",
  property_name: "propertyName",
  property_url: "propertyUrl",
  unsubscribe_url: "unsubscribeUrl",
};

export const CAMPAIGN_EMAIL_PREVIEW_CONTEXT: CampaignVariableContext = {
  firstName: "Alex",
  lastName: "Example",
  projectName: "Sample project",
  propertyName: "Sample property",
  propertyUrl: "https://example.com/properties/sample",
  unsubscribeUrl: "https://example.com/unsubscribe",
};

export function normalizeCampaignVariableTokens(content: string): string {
  let normalized = content;

  for (const variable of CAMPAIGN_EMAIL_VARIABLES) {
    normalized = normalized.replaceAll(`{{${variable.key}}}`, variable.token);
  }

  return normalized;
}

export function applyCampaignVariables(
  content: string,
  context: CampaignVariableContext,
): string {
  let result = content;

  for (const variable of CAMPAIGN_EMAIL_VARIABLES) {
    const value = context[CAMPAIGN_VARIABLE_CONTEXT_KEYS[variable.key]] ?? "";
    result = result.replaceAll(`{{${variable.key}}}`, value);
    result = result.replaceAll(variable.token, value);
  }

  return result;
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

/** Tags that are unsafe or unsupported in email clients (not email <head> tags like meta/link). */
const UNSAFE_TAG_PATTERN =
  /<(script|iframe|embed|object|form|input|button|base)\b/gi;

/** Void / self-closing tags that do not need a matching close tag. */
const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Event-handler attributes (onclick=, onload=, …) — not substrings like content=. */
const INLINE_EVENT_HANDLER_PATTERN = /\s(on[a-z]+)\s*=/i;
const JAVASCRIPT_URL_PATTERN = /\bjavascript\s*:/i;

export function emailBodyHasUnsubscribe(content: string): boolean {
  const normalized = normalizeCampaignVariableTokens(content);

  if (normalized.includes("{unsubscribe_url}")) {
    return true;
  }

  if (contentHasUnsubscribeAnchor(content)) {
    return true;
  }

  return /https?:\/\/\S*unsubscribe/i.test(content);
}

/** True when content already has a hyperlinked unsubscribe URL (not a bare URL). */
export function contentHasUnsubscribeAnchor(content: string): boolean {
  return /<a\b[^>]*href=["'][^"']*unsubscribe[^"']*["'][^>]*>/i.test(content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes bare unsubscribe URLs / merge tokens from email content while
 * preserving href attributes on existing anchors. Campaign sends always append
 * a formatted "Unsubscribe" footer unless a custom unsubscribe anchor remains.
 */
export function stripBareUnsubscribeUrls(
  content: string,
  unsubscribeUrl?: string | null,
): string {
  const hrefPlaceholders: string[] = [];
  let result = content.replace(/\bhref\s*=\s*(["'])[\s\S]*?\1/gi, (match) => {
    hrefPlaceholders.push(match);
    return `__UNSUB_HREF_${hrefPlaceholders.length - 1}__`;
  });

  const trimmedUrl = unsubscribeUrl?.trim() ?? "";
  if (trimmedUrl && /unsubscribe/i.test(trimmedUrl)) {
    const escapedUrl = escapeRegExp(trimmedUrl);
    result = result.replace(
      new RegExp(`(?:Unsubscribe\\s*:\\s*)?${escapedUrl}`, "gi"),
      "",
    );
  }

  result = result.replace(/\{\{?unsubscribe_url\}\}?/gi, "");
  result = result.replace(/https?:\/\/[^\s<>"']*unsubscribe[^\s<>"']*/gi, "");

  result = result.replace(/__UNSUB_HREF_(\d+)__/g, (_, index: string) => {
    return hrefPlaceholders[Number(index)] ?? "";
  });

  return result
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

/** Plain-text body with a single unsubscribe line (never a duplicated raw URL). */
export function buildCampaignEmailPlainText(
  body: string,
  unsubscribeUrl: string,
): string {
  const cleaned = stripBareUnsubscribeUrls(body, unsubscribeUrl).trim();
  const footer = `Unsubscribe: ${unsubscribeUrl}`;

  if (!cleaned) {
    return footer;
  }

  if (/unsubscribe/i.test(cleaned) && cleaned.includes(unsubscribeUrl)) {
    return cleaned;
  }

  return `${cleaned}\n\n${footer}`;
}

function countUnclosedHtmlTags(html: string): number {
  const openTags = html.match(/<([a-z][a-z0-9]*)\b[^>]*\/?>/gi) ?? [];
  const closeTags = html.match(/<\/([a-z][a-z0-9]*)\s*>/gi) ?? [];

  let openCount = 0;
  for (const tag of openTags) {
    const nameMatch = tag.match(/^<\/?([a-z][a-z0-9]*)/i);
    const name = nameMatch?.[1]?.toLowerCase();
    if (!name || VOID_HTML_TAGS.has(name) || /\/\s*>$/.test(tag)) {
      continue;
    }
    openCount += 1;
  }

  return openCount - closeTags.length;
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

  if (countUnclosedHtmlTags(html) > 5) {
    warnings.push({
      code: "broken_tags",
      message: "This email may contain broken or unclosed HTML tags.",
    });
  }

  const unsafeMatches = html.match(UNSAFE_TAG_PATTERN);
  if (unsafeMatches) {
    const tags = [
      ...new Set(
        unsafeMatches.map((tag) => {
          const nameMatch = tag.match(/^<([a-z][a-z0-9]*)/i);
          return (nameMatch?.[1] ?? tag.replace(/[<>\/]/g, "")).toLowerCase();
        }),
      ),
    ];
    warnings.push({
      code: "unsafe_tags",
      message: `This email contains unsupported tags: ${tags.map((tag) => `<${tag}>`).join(", ")}. These may be removed or may not render correctly in email clients.`,
    });
  }

  if (INLINE_EVENT_HANDLER_PATTERN.test(html) || JAVASCRIPT_URL_PATTERN.test(html)) {
    warnings.push({
      code: "unsafe_javascript",
      message: "This email contains inline JavaScript, which is not supported in most email clients.",
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
  if (delayDays === 0) {
    return `Send at ${sendTime}`;
  }

  const dayLabel = delayDays === 1 ? "1 day" : `${delayDays} days`;
  return `Wait ${dayLabel}, then send at ${sendTime}`;
}

export function addMinutesToCampaignSendTime(sendTime: string, minutes: number): string {
  const normalized = normalizeCampaignSendTime(sendTime);
  const [hour, minute] = normalized.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(wrapped / 60);
  const nextMinute = wrapped % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

export function getZeroDelaySendTimeSequenceIssue(
  steps: Array<{ order: number; delayDays: number; sendTime: string }>,
): string | null {
  const sorted = [...steps].sort((left, right) => left.order - right.order);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const step = sorted[index];

    if (!previous || previous.delayDays !== 0 || step.delayDays !== 0) {
      continue;
    }

    const previousTime = normalizeCampaignSendTime(previous.sendTime);
    const stepTime = normalizeCampaignSendTime(step.sendTime);

    if (stepTime <= previousTime) {
      return `Step ${step.order} (${stepTime}) must send after step ${previous.order} (${previousTime}) when both are same-day zero-delay emails.`;
    }
  }

  return null;
}

/** Blocks save only when the step being saved violates its immediate predecessor. */
export function getZeroDelaySendTimePredecessorIssue(
  step: { order: number; delayDays: number; sendTime: string },
  steps: Array<{ order: number; delayDays: number; sendTime: string }>,
): string | null {
  const sorted = [...steps].sort((left, right) => left.order - right.order);
  const index = sorted.findIndex((item) => item.order === step.order);

  if (index <= 0) {
    return null;
  }

  const previous = sorted[index - 1];

  if (!previous || previous.delayDays !== 0 || step.delayDays !== 0) {
    return null;
  }

  const previousTime = normalizeCampaignSendTime(previous.sendTime);
  const stepTime = normalizeCampaignSendTime(step.sendTime);

  if (stepTime <= previousTime) {
    return `Step ${step.order} (${stepTime}) must send after step ${previous.order} (${previousTime}) when both are same-day zero-delay emails.`;
  }

  return null;
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
