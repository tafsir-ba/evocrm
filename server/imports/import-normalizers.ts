import "server-only";

import {
  PROPERTY_TYPE_INTERESTS,
  TRANSACTION_INTENTS,
  USAGE_PURPOSES,
} from "@/lib/lead-preferences";
import { SURFACE_UNITS } from "@/lib/surface-unit";
import { normalizeLeadEmail, normalizeLeadPhone } from "@/server/services/leads";
import { normalizePropertyReference } from "@/server/services/properties";

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} | null {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: parts[0]! };
  }

  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
  };
}

export function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const stringValue = String(value).trim().replace(/,/g, "");

  if (!stringValue) {
    return undefined;
  }

  const parsed = Number(stringValue);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

export function parseOptionalCurrency(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const stringValue = String(value)
    .trim()
    .replace(/[€$£¥]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");

  if (!stringValue) {
    return undefined;
  }

  const parsed = Number(stringValue);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

export function parseCommaSeparatedList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  return String(value)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeEmailValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  try {
    return normalizeLeadEmail(String(value)).email;
  } catch {
    return undefined;
  }
}

export function normalizePhoneValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  try {
    return normalizeLeadPhone(String(value)).phone;
  } catch {
    return String(value).trim() || undefined;
  }
}

export function normalizeReferenceValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return normalizePropertyReference(String(value)) ?? undefined;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function resolveDictionaryId(
  lookup: Map<string, string>,
  value: unknown,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  return lookup.get(normalized);
}

export function resolveProjectId(
  lookup: Map<string, string>,
  value: unknown,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  return lookup.get(normalized);
}

export function resolveMemberId(
  lookup: Map<string, string>,
  value: unknown,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  return lookup.get(normalized);
}

export function resolveTagIds(
  lookup: Map<string, string>,
  value: unknown,
): string[] {
  const labels = parseCommaSeparatedList(value);
  const ids: string[] = [];

  for (const label of labels) {
    const id = lookup.get(label.toLowerCase());

    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

export function isPropertyTypeInterest(
  value: string,
): value is (typeof PROPERTY_TYPE_INTERESTS)[number] {
  return (PROPERTY_TYPE_INTERESTS as readonly string[]).includes(value);
}

export function isTransactionIntent(
  value: string,
): value is (typeof TRANSACTION_INTENTS)[number] {
  return (TRANSACTION_INTENTS as readonly string[]).includes(value);
}

export function isUsagePurpose(
  value: string,
): value is (typeof USAGE_PURPOSES)[number] {
  return (USAGE_PURPOSES as readonly string[]).includes(value);
}

export function isSurfaceUnit(
  value: string,
): value is (typeof SURFACE_UNITS)[number] {
  return (SURFACE_UNITS as readonly string[]).includes(value);
}

export function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

export function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/^[=+\-@]/, (match) => `'${match}`);

  if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}
