import "server-only";

import { AppError } from "@/server/errors";
import { MAX_FEEDBACK_REQUEST_BYTES } from "@/server/feedback/constants";

export function assertFeedbackContentLength(request: Request): void {
  const raw = request.headers.get("content-length");

  if (!raw) {
    return;
  }

  const length = Number.parseInt(raw, 10);

  if (!Number.isFinite(length) || length < 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid Content-Length header.");
  }

  if (length > MAX_FEEDBACK_REQUEST_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Request body is too large.", {
      details: { maxBytes: MAX_FEEDBACK_REQUEST_BYTES },
    });
  }
}
