import "server-only";

export type ErrorContext = {
  route?: string;
  workspaceId?: string;
  userId?: string;
  code?: string;
  tags?: Record<string, string>;
};

const SENSITIVE_PATTERN =
  /(api[_-]?key|secret|password|token|authorization|bearer|credential)/i;

function redactMessage(message: string): string {
  return message.replace(
    /([A-Za-z0-9_]*(?:api[_-]?key|secret|password|token)[A-Za-z0-9_]*)=([^\s&]+)/gi,
    "$1=[redacted]",
  );
}

function sanitizeContext(context?: ErrorContext): ErrorContext | undefined {
  if (!context) {
    return undefined;
  }

  const sanitized: ErrorContext = { ...context };

  if (sanitized.tags) {
    sanitized.tags = Object.fromEntries(
      Object.entries(sanitized.tags).map(([key, value]) => [
        key,
        SENSITIVE_PATTERN.test(key) ? "[redacted]" : value,
      ]),
    );
  }

  return sanitized;
}

/**
 * Safe server-side error capture.
 * Phase 13: structured console logging placeholder until an approved provider (e.g. Sentry) is wired.
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  const message =
    error instanceof Error
      ? redactMessage(error.message)
      : redactMessage(String(error));

  const payload = {
    level: "error",
    message,
    name: error instanceof Error ? error.name : "UnknownError",
    context: sanitizeContext(context),
    timestamp: new Date().toISOString(),
  };

  console.error("[evocrm:error]", JSON.stringify(payload));
}
