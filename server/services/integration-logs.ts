import "server-only";

import { createIntegrationLog } from "@/server/repositories/integration-logs";
import type {
  IntegrationLogDirection,
  IntegrationLogStatus,
} from "@/server/repositories/integration-logs";

const MAX_ERROR_LENGTH = 500;
const MAX_SUMMARY_VALUE_LENGTH = 200;
const MAX_SUMMARY_KEYS = 20;
const SENSITIVE_SUMMARY_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "token",
  "secret",
  "password",
  "credentials",
  "email",
  "phone",
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "fullname",
  "full_name",
]);

function isSensitiveSummaryKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_SUMMARY_KEYS.has(normalized);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function sanitizeIntegrationLogError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return truncate(message.replace(/[\r\n]+/g, " ").trim(), MAX_ERROR_LENGTH);
}

export function sanitizePayloadSummary(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(summary).slice(0, MAX_SUMMARY_KEYS);

  for (const [key, value] of entries) {
    if (isSensitiveSummaryKey(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "boolean" || typeof value === "number") {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = truncate(value, MAX_SUMMARY_VALUE_LENGTH);
    }
  }

  return sanitized;
}

export async function writeIntegrationLog(input: {
  workspaceId: string;
  integrationId: string;
  direction: IntegrationLogDirection;
  status: IntegrationLogStatus;
  eventType: string;
  payloadSummary?: Record<string, unknown>;
  error?: unknown;
}): Promise<void> {
  await createIntegrationLog({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    direction: input.direction,
    status: input.status,
    eventType: input.eventType,
    payloadSummary: input.payloadSummary
      ? sanitizePayloadSummary(input.payloadSummary)
      : null,
    error: input.error !== undefined ? sanitizeIntegrationLogError(input.error) : null,
  });
}

export function buildWebsiteLeadPayloadSummary(input: {
  externalId?: string;
  email?: string;
  phone?: string;
  source?: string;
  leadId?: string;
  duplicate?: boolean;
  idempotent?: boolean;
  validationFields?: string[];
}): Record<string, unknown> {
  return sanitizePayloadSummary({
    ...(input.externalId ? { externalId: input.externalId } : {}),
    emailPresent: Boolean(input.email?.trim()),
    phonePresent: Boolean(input.phone?.trim()),
    ...(input.source ? { source: input.source } : {}),
    ...(input.leadId ? { leadId: input.leadId } : {}),
    ...(input.duplicate ? { duplicateDetected: true } : {}),
    ...(input.idempotent ? { idempotentReplay: true } : {}),
    ...(input.validationFields?.length
      ? { validationFieldsFailed: input.validationFields.join(", ") }
      : {}),
  });
}
