import "server-only";

import { AppError } from "@/server/errors";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export const AUTH_SIGNUP_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
} as const;

export const UNSUBSCRIBE_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
} as const;

export function resetPublicRouteRateLimitStoreForTests(): void {
  buckets.clear();
}

function peek(key: string, maxRequests: number): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function consume(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function assertSignupRateLimit(ip: string): void {
  const result = consume(
    `signup:${ip}`,
    AUTH_SIGNUP_RATE_LIMIT.maxRequests,
    AUTH_SIGNUP_RATE_LIMIT.windowMs,
  );

  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Too many signup attempts — try again later.", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

/** Returns false when over limit (caller should skip work but may still return 200). */
export function consumeUnsubscribeRateLimit(ip: string): boolean {
  return consume(
    `unsubscribe:${ip}`,
    UNSUBSCRIBE_RATE_LIMIT.maxRequests,
    UNSUBSCRIBE_RATE_LIMIT.windowMs,
  ).allowed;
}

export function peekSignupRateLimit(ip: string): boolean {
  return peek(`signup:${ip}`, AUTH_SIGNUP_RATE_LIMIT.maxRequests).allowed;
}
