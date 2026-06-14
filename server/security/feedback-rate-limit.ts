import "server-only";

import { AppError } from "@/server/errors";
import { FEEDBACK_RATE_LIMIT } from "@/server/feedback/constants";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function resetFeedbackRateLimitStoreForTests(): void {
  buckets.clear();
}

export function getFeedbackRateLimitKey(userId: string): string {
  return `feedback:${userId}`;
}

export function checkFeedbackRateLimit(userId: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const key = getFeedbackRateLimitKey(userId);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + FEEDBACK_RATE_LIMIT.windowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= FEEDBACK_RATE_LIMIT.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function assertFeedbackRateLimit(userId: string): void {
  const result = checkFeedbackRateLimit(userId);

  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many submissions — try again later.", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}
