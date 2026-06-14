import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

const API_KEY_PREFIX = "evocrm_whk_";

function getHashPepper(): string {
  if (process.env.NODE_ENV === "test") {
    return "evocrm-integration-api-key-test-pepper";
  }

  const env = getEnv();

  if (!env.NEXTAUTH_SECRET) {
    throw new AppError("INTERNAL_ERROR", "Integration API key hashing is not configured.", {
      expose: false,
    });
  }

  return env.NEXTAUTH_SECRET;
}

export function generateIntegrationApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashIntegrationApiKey(rawKey: string): string {
  return createHash("sha256")
    .update(`${getHashPepper()}:${rawKey}`)
    .digest("hex");
}

export function verifyIntegrationApiKey(rawKey: string, storedHash: string): boolean {
  const computed = hashIntegrationApiKey(rawKey);
  const computedBuffer = Buffer.from(computed);
  const storedBuffer = Buffer.from(storedHash);

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, storedBuffer);
}

export function parseIntegrationApiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice("Bearer ".length).trim();
    if (key) {
      return key;
    }
  }

  const headerKey = request.headers.get("X-Integration-Key")?.trim();
  return headerKey || null;
}
