import "server-only";

import { MAX_FEEDBACK_PAGE_URL_CHARS } from "@/server/feedback/constants";

function parseAllowedOrigin(appUrl: string): string | null {
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

export function normalizeFeedbackPageUrl(
  raw: string | undefined | null,
  appUrl: string,
): string | null {
  if (!raw?.trim()) {
    return null;
  }

  const trimmed = raw.trim();
  const allowedOrigin = parseAllowedOrigin(appUrl);

  if (!allowedOrigin) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.origin !== allowedOrigin) {
    return null;
  }

  if (trimmed.length > MAX_FEEDBACK_PAGE_URL_CHARS) {
    return trimmed.slice(0, MAX_FEEDBACK_PAGE_URL_CHARS);
  }

  return trimmed;
}
