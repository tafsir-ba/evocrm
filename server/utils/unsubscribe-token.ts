import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export type UnsubscribeTokenPayload = {
  workspaceId: string;
  leadId: string;
  enrollmentId: string;
  campaignId: string;
  exp: number;
};

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function getSigningSecret(): string {
  const env = getEnv();
  const secret = env.NEXTAUTH_SECRET ?? env.CRON_SECRET;

  if (!secret) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Unsubscribe signing is not configured.",
      { expose: false },
    );
  }

  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(data: string): string {
  return createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
}

export function createUnsubscribeToken(payload: {
  workspaceId: string;
  leadId: string;
  enrollmentId: string;
  campaignId: string;
}): string {
  const fullPayload: UnsubscribeTokenPayload = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload {
  const parts = token.split(".");

  if (parts.length !== 2) {
    throw new AppError("VALIDATION_ERROR", "Invalid unsubscribe token.");
  }

  const [encoded, signature] = parts;
  const expected = sign(encoded);

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new AppError("VALIDATION_ERROR", "Invalid unsubscribe token.");
  }

  let payload: UnsubscribeTokenPayload;

  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as UnsubscribeTokenPayload;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid unsubscribe token.");
  }

  if (
    !payload.workspaceId ||
    !payload.leadId ||
    !payload.enrollmentId ||
    !payload.campaignId ||
    !payload.exp
  ) {
    throw new AppError("VALIDATION_ERROR", "Invalid unsubscribe token.");
  }

  if (Date.now() > payload.exp) {
    throw new AppError("VALIDATION_ERROR", "Unsubscribe token has expired.");
  }

  return payload;
}

export function buildUnsubscribeUrl(token: string): string {
  const env = getEnv();
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}
