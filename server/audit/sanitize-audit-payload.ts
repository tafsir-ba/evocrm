import "server-only";

const SENSITIVE_FIELD_PATTERN =
  /^(apiKey|apiKeyHash|credentialsEncrypted|passwordHash|secret|token|storageKey|bucket|signedUrl|rawPayload)$/i;

const SENSITIVE_KEY_SUBSTRINGS = [
  "apikey",
  "password",
  "secret",
  "token",
  "credential",
  "signedurl",
  "storagekey",
];

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_FIELD_PATTERN.test(key)) {
    return true;
  }

  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((fragment) => normalized.includes(fragment));
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[truncated]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = "[redacted]";
      continue;
    }

    result[key] = sanitizeValue(nested, depth + 1);
  }

  return result;
}

export function sanitizeAuditPayload(
  payload?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }

  return sanitizeValue(payload) as Record<string, unknown>;
}
