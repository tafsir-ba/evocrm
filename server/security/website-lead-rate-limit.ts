import "server-only";

import { AppError } from "@/server/errors";
import { hashIntegrationApiKey } from "@/server/services/integration-api-keys";
import { incrementMongoWebsiteLeadRateLimitBucket } from "@/server/security/website-lead-rate-limit-store";

export const WEBSITE_LEAD_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000,
} as const;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function useInMemoryWebsiteLeadRateLimitStore(): boolean {
  return process.env.NODE_ENV === "test";
}

export function resetWebsiteLeadRateLimitStoreForTests(): void {
  buckets.clear();
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

export function getWebsiteLeadRateLimitKey(
  request: Request,
  rawApiKey: string | null,
): string {
  if (rawApiKey) {
    return `website-lead:api-key:${hashIntegrationApiKey(rawApiKey)}`;
  }

  return `website-lead:ip:${getClientIp(request)}`;
}

function checkInMemoryWebsiteLeadRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WEBSITE_LEAD_RATE_LIMIT.windowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= WEBSITE_LEAD_RATE_LIMIT.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkWebsiteLeadRateLimit(key: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  if (useInMemoryWebsiteLeadRateLimitStore()) {
    return checkInMemoryWebsiteLeadRateLimit(key);
  }

  const bucket = await incrementMongoWebsiteLeadRateLimitBucket(
    key,
    WEBSITE_LEAD_RATE_LIMIT.windowMs,
  );
  const now = Date.now();

  if (bucket.count > WEBSITE_LEAD_RATE_LIMIT.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function assertWebsiteLeadRateLimit(
  request: Request,
  rawApiKey: string | null,
): Promise<void> {
  const key = getWebsiteLeadRateLimitKey(request, rawApiKey);
  const result = await checkWebsiteLeadRateLimit(key);

  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Rate limit exceeded.", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}
