import "server-only";

import { AppError } from "@/server/errors";
import { getClientIpFromRequest } from "@/server/security/public-route-rate-limit";
import { incrementMongoWebsiteLeadRateLimitBucket } from "@/server/security/website-lead-rate-limit-store";

export const HUBSPOT_WEBHOOK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000,
} as const;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function useInMemoryHubSpotWebhookRateLimitStore(): boolean {
  return process.env.NODE_ENV === "test";
}

export function resetHubSpotWebhookRateLimitStoreForTests(): void {
  buckets.clear();
}

export function getHubSpotWebhookIpRateLimitKey(request: Request): string {
  return `hubspot-webhook:ip:${getClientIpFromRequest(request)}`;
}

function checkInMemoryHubSpotWebhookRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + HUBSPOT_WEBHOOK_RATE_LIMIT.windowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= HUBSPOT_WEBHOOK_RATE_LIMIT.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

async function checkHubSpotWebhookRateLimit(key: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  if (useInMemoryHubSpotWebhookRateLimitStore()) {
    return checkInMemoryHubSpotWebhookRateLimit(key);
  }

  const bucket = await incrementMongoWebsiteLeadRateLimitBucket(
    key,
    HUBSPOT_WEBHOOK_RATE_LIMIT.windowMs,
  );
  const now = Date.now();

  if (bucket.count > HUBSPOT_WEBHOOK_RATE_LIMIT.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function assertHubSpotWebhookRateLimit(request: Request): Promise<void> {
  const result = await checkHubSpotWebhookRateLimit(getHubSpotWebhookIpRateLimitKey(request));

  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", "Rate limit exceeded.", {
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}
