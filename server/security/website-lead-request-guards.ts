import "server-only";

import { AppError } from "@/server/errors";

/** Max JSON body size for website lead webhook payloads (64 KB). */
export const MAX_WEBSITE_LEAD_REQUEST_BYTES = 64 * 1024;

export function assertWebsiteLeadContentLength(request: Request): void {
  const raw = request.headers.get("content-length");

  if (!raw) {
    return;
  }

  const length = Number.parseInt(raw, 10);

  if (!Number.isFinite(length) || length < 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid Content-Length header.");
  }

  if (length > MAX_WEBSITE_LEAD_REQUEST_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", {
      details: { maxBytes: MAX_WEBSITE_LEAD_REQUEST_BYTES },
    });
  }
}
