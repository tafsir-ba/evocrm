import "server-only";

import { z } from "zod";

/**
 * Environment validation with phase-aware requirements.
 *
 * Phase 0 requires only: NODE_ENV, MONGODB_URI, NEXT_PUBLIC_APP_URL
 * Later-phase variables are parsed when present but not required until
 * their feature is enabled. See /docs/env.example.md.
 */

const nodeEnvSchema = z.enum(["development", "test", "production"]);

const optionalNonEmptyString = z
  .string()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  NEXT_PUBLIC_APP_URL: z.string().url(),
  MONGODB_URI: z.string().min(1),

  // Phase 2 — Auth.js
  NEXTAUTH_URL: optionalNonEmptyString,
  NEXTAUTH_SECRET: optionalNonEmptyString,
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,

  // Phase 8 — DigitalOcean Spaces
  DIGITALOCEAN_SPACES_ENDPOINT: optionalNonEmptyString,
  DIGITALOCEAN_SPACES_REGION: optionalNonEmptyString,
  DIGITALOCEAN_SPACES_BUCKET: optionalNonEmptyString,
  DIGITALOCEAN_SPACES_KEY: optionalNonEmptyString,
  DIGITALOCEAN_SPACES_SECRET: optionalNonEmptyString,

  // Phase 10 — Email / cron
  RESEND_API_KEY: optionalNonEmptyString,
  EMAIL_FROM: optionalNonEmptyString,
  EMAIL_REPLY_TO: optionalNonEmptyString,
  CRON_SECRET: optionalNonEmptyString,

  // Phase 11 — Stripe (optional)
  STRIPE_SECRET_KEY: optionalNonEmptyString,
  STRIPE_WEBHOOK_SECRET: optionalNonEmptyString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalNonEmptyString,
});

export type Env = z.infer<typeof envSchema>;

export type EnvInput = Record<string, string | undefined>;

function withBuildDefaults(input: EnvInput): EnvInput {
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    return input;
  }

  return {
    NODE_ENV: input.NODE_ENV ?? "production",
    NEXT_PUBLIC_APP_URL:
      input.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    MONGODB_URI: input.MONGODB_URI ?? "mongodb://localhost:27017/evocrm",
    ...input,
  };
}

export function parseEnv(input: EnvInput = process.env): Env {
  const result = envSchema.safeParse(withBuildDefaults(input));

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return result.data;
}

let cachedEnv: Env | undefined;

/**
 * Validated environment for server runtime.
 * Cached after first successful parse.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}

/**
 * Reset cached env — for tests only.
 */
export function resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
