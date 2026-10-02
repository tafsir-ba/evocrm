import "server-only";

import { AppError } from "@/server/errors";

/** Cap newsletter test-send volume per actor+workspace. */
export const NEWSLETTER_TEST_SEND_RATE_LIMIT = {
  /** Max test-send requests in the window. */
  maxRequests: 5,
  /** Sliding fixed window length. */
  windowMs: 10 * 60 * 1000,
  /** Max total recipient addresses across those requests. */
  maxRecipients: 30,
} as const;

type RateLimitBucket = {
  requestCount: number;
  recipientCount: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function resetNewsletterTestSendRateLimitStoreForTests(): void {
  buckets.clear();
}

export function getNewsletterTestSendRateLimitKey(
  workspaceId: string,
  actorId: string,
): string {
  return `newsletter-test-send:${workspaceId}:${actorId}`;
}

export function assertNewsletterTestSendRateLimit(
  workspaceId: string,
  actorId: string,
  recipientCount: number,
): void {
  const key = getNewsletterTestSendRateLimitKey(workspaceId, actorId);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      requestCount: 1,
      recipientCount,
      resetAt: now + NEWSLETTER_TEST_SEND_RATE_LIMIT.windowMs,
    });
    return;
  }

  const nextRequests = existing.requestCount + 1;
  const nextRecipients = existing.recipientCount + recipientCount;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  if (
    existing.requestCount >= NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRequests ||
    existing.recipientCount + recipientCount >
      NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRecipients
  ) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many newsletter test emails — wait a few minutes and try again.",
      {
        details: {
          retryAfterSeconds,
          maxRequests: NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRequests,
          maxRecipients: NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRecipients,
        },
      },
    );
  }

  existing.requestCount = nextRequests;
  existing.recipientCount = nextRecipients;
  buckets.set(key, existing);
}
