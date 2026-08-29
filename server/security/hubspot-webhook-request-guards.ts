import "server-only";

import { AppError } from "@/server/errors";

/** Max webhook body size for HubSpot inbound events (64 KB; matches website lead parity). */
export const MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES = 64 * 1024;

export function assertHubSpotWebhookContentLength(request: Request): void {
  const raw = request.headers.get("content-length");

  if (!raw) {
    return;
  }

  const length = Number.parseInt(raw, 10);

  if (!Number.isFinite(length) || length < 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid Content-Length header.");
  }

  if (length > MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", {
      details: { maxBytes: MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES },
    });
  }
}

export function assertHubSpotWebhookRawBodySize(rawBody: string): void {
  const bytes = Buffer.byteLength(rawBody, "utf8");

  if (bytes > MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", {
      details: { maxBytes: MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES },
    });
  }
}
