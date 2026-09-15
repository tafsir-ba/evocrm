import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

const utmSchema = z
  .object({
    source: z.string().trim().max(120).optional(),
    medium: z.string().trim().max(120).optional(),
    campaign: z.string().trim().max(120).optional(),
    term: z.string().trim().max(120).optional(),
    content: z.string().trim().max(120).optional(),
  })
  .strict();

const websiteLeadCaptureCanonicalSchema = z
  .object({
    externalId: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().trim().max(200).optional(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    message: z.string().trim().max(5000).optional(),
    source: z.string().trim().max(120).optional(),
    preferredAreas: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    propertyReference: z.string().trim().max(120).optional(),
    projectId: objectIdSchema.optional(),
    projectReference: z.string().trim().min(1).max(120).optional(),
    emailConsentStatus: z.enum(["unknown", "subscribed", "unsubscribed"]).optional(),
    industry: z.string().trim().max(120).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    stateRegion: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(200).optional(),
    utm: utmSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email?.trim() || value.phone?.trim()), {
    message: "At least one of email or phone is required.",
    path: ["email"],
  })
  .refine(
    (value) =>
      value.budgetMin === undefined ||
      value.budgetMax === undefined ||
      value.budgetMax >= value.budgetMin,
    {
      message: "budgetMax must be greater than or equal to budgetMin.",
      path: ["budgetMax"],
    },
  );

export type WebsiteLeadCaptureInput = z.infer<typeof websiteLeadCaptureCanonicalSchema>;

const MESSAGE_MAX_LENGTH = 5000;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

const CONTEXT_FIELDS: Array<[string, string]> = [
  ["lead_type", "Lead type"],
  ["leadType", "Lead type"],
  ["source_page", "Page"],
  ["page", "Page"],
  ["page_url", "URL"],
  ["pageUrl", "URL"],
  ["source_url", "URL"],
  ["sourceUrl", "URL"],
  ["source_building", "Building"],
  ["building", "Building"],
  ["source_unit", "Unit"],
  ["unit", "Unit"],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const items = value
      .split(/[,;|/]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function looksLikeObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

function consentToEmailStatus(value: unknown): "subscribed" | "unsubscribed" | "unknown" | undefined {
  if (value === true || value === 1) {
    return "subscribed";
  }
  if (value === false || value === 0) {
    return "unsubscribed";
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["subscribed", "yes", "true", "1", "on", "accepted"].includes(normalized)) {
    return "subscribed";
  }
  if (["unsubscribed", "no", "false", "0", "off"].includes(normalized)) {
    return "unsubscribed";
  }
  if (normalized === "unknown") {
    return "unknown";
  }
  return undefined;
}

function mergeUtm(record: Record<string, unknown>): Record<string, string> | undefined {
  const nested = isPlainObject(record.utm) ? record.utm : {};
  const mapping: Record<string, string | undefined> = {
    source: asNonEmptyString(nested.source) ?? firstString(record, ["utm_source", "utmSource"]),
    medium: asNonEmptyString(nested.medium) ?? firstString(record, ["utm_medium", "utmMedium"]),
    campaign: asNonEmptyString(nested.campaign) ?? firstString(record, ["utm_campaign", "utmCampaign"]),
    term: asNonEmptyString(nested.term) ?? firstString(record, ["utm_term", "utmTerm"]),
    content: asNonEmptyString(nested.content) ?? firstString(record, ["utm_content", "utmContent"]),
  };
  const utm: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value) {
      utm[key] = value.slice(0, 120);
    }
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

function composeMessage(record: Record<string, unknown>, existing: string | undefined): string | undefined {
  const parts: string[] = [];
  if (existing) {
    parts.push(existing);
  }

  const context: string[] = [];
  for (const [key, label] of CONTEXT_FIELDS) {
    const value = asNonEmptyString(record[key]);
    if (value) {
      context.push(`${label}: ${value}`);
    }
  }

  const typologies = asStringList(
    record.interested_typologies ?? record.typologies ?? record.preferred_areas,
  );
  if (typologies?.length) {
    context.push(`Typologies: ${typologies.join(", ")}`);
  }

  if (context.length > 0) {
    parts.push(context.join("\n"));
  }

  if (parts.length === 0) {
    return undefined;
  }

  const message = parts.join("\n\n");
  return message.length > MESSAGE_MAX_LENGTH
    ? `${message.slice(0, MESSAGE_MAX_LENGTH - 1)}…`
    : message;
}

/**
 * Map common marketing-site payloads onto the canonical website-lead contract.
 * Extra fields are ignored (never trusted for workspace/auth). Workspace is
 * always derived from the integration API key.
 */
export function normalizeWebsiteLeadCaptureBody(input: unknown): unknown {
  if (!isPlainObject(input)) {
    return input;
  }

  const firstName = firstString(input, ["firstName", "first_name", "firstname"]);
  const lastName = firstString(input, ["lastName", "last_name", "lastname"]);
  const email = firstString(input, ["email"]);
  const phone = firstString(input, ["phone", "telephone", "tel"]);
  const source = firstString(input, ["source"]);
  const externalId = firstString(input, ["externalId", "external_id"]);
  const idempotencyKey = firstString(input, ["idempotencyKey", "idempotency_key"]);
  const industry = firstString(input, ["industry"]);
  const jobTitle = firstString(input, ["jobTitle", "job_title"]);
  const stateRegion = firstString(input, ["stateRegion", "state_region", "state", "region"]);
  const companyName = firstString(input, ["companyName", "company_name", "company"]);
  const propertyReference = firstString(input, [
    "propertyReference",
    "property_reference",
    "source_unit",
    "unit",
    "unit_reference",
    "unitReference",
  ]);

  const explicitProjectId = firstString(input, ["projectId", "project_id"]);
  const projectLabel = firstString(input, [
    "projectReference",
    "project_reference",
    "project_name",
    "project",
  ]);

  const preferredAreas = asStringList(
    input.preferredAreas ??
      input.preferred_areas ??
      input.interested_typologies ??
      input.typologies,
  );
  const budgetMin = asNonNegativeNumber(input.budgetMin ?? input.budget_min);
  const budgetMax = asNonNegativeNumber(input.budgetMax ?? input.budget_max);
  const emailConsentStatus =
    consentToEmailStatus(input.emailConsentStatus) ??
    consentToEmailStatus(input.email_consent_status) ??
    consentToEmailStatus(input.consent);
  const utm = mergeUtm(input);
  const message = composeMessage(input, firstString(input, ["message", "notes", "comment"]));

  const normalized: Record<string, unknown> = {};
  if (firstName) normalized.firstName = firstName;
  if (lastName) normalized.lastName = lastName;
  if (email) normalized.email = email;
  if (phone) normalized.phone = phone.slice(0, 40);
  if (message) normalized.message = message;
  if (source) normalized.source = source.slice(0, 120);
  if (externalId) normalized.externalId = externalId;
  if (idempotencyKey) normalized.idempotencyKey = idempotencyKey;
  if (propertyReference) normalized.propertyReference = propertyReference.slice(0, 120);
  if (explicitProjectId) {
    normalized.projectId = explicitProjectId;
  } else if (projectLabel && looksLikeObjectId(projectLabel)) {
    normalized.projectId = projectLabel;
  } else if (projectLabel) {
    normalized.projectReference = projectLabel.slice(0, 120);
  }
  if (preferredAreas) normalized.preferredAreas = preferredAreas;
  if (budgetMin !== undefined) normalized.budgetMin = budgetMin;
  if (budgetMax !== undefined) normalized.budgetMax = budgetMax;
  if (emailConsentStatus) normalized.emailConsentStatus = emailConsentStatus;
  if (industry) normalized.industry = industry.slice(0, 120);
  if (jobTitle) normalized.jobTitle = jobTitle.slice(0, 120);
  if (stateRegion) normalized.stateRegion = stateRegion.slice(0, 120);
  if (companyName) normalized.companyName = companyName.slice(0, 200);
  if (utm) normalized.utm = utm;

  return normalized;
}

export const websiteLeadCaptureInputSchema = z.preprocess(
  normalizeWebsiteLeadCaptureBody,
  websiteLeadCaptureCanonicalSchema,
);
