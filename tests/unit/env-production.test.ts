import { afterEach, describe, expect, it } from "vitest";

import {
  getProductionRequiredKeys,
  parseEnv,
  resetEnvCacheForTests,
  validateProductionEnv,
} from "@/server/env";

const baseEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  MONGODB_URI: "mongodb://localhost:27017/evocrm_test",
};

describe("validateProductionEnv", () => {
  afterEach(() => {
    resetEnvCacheForTests();
  });

  it("lists required production keys", () => {
    expect(getProductionRequiredKeys()).toContain("NEXTAUTH_SECRET");
    expect(getProductionRequiredKeys()).toContain("CRON_SECRET");
  });

  it("throws when production env is missing required keys", () => {
    expect(() =>
      validateProductionEnv({
        ...baseEnv,
        NODE_ENV: "production",
      } as ReturnType<typeof parseEnv>),
    ).toThrow(/Missing required production environment variables/);
  });

  it("parses production env when all required keys are present", () => {
    const env = parseEnv({
      ...baseEnv,
      NODE_ENV: "production",
      NEXTAUTH_URL: "https://app.example.com",
      NEXTAUTH_SECRET: "secret",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      DIGITALOCEAN_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.com",
      DIGITALOCEAN_SPACES_REGION: "nyc3",
      DIGITALOCEAN_SPACES_BUCKET: "evocrm",
      DIGITALOCEAN_SPACES_KEY: "key",
      DIGITALOCEAN_SPACES_SECRET: "spaces-secret",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "noreply@example.com",
      EMAIL_REPLY_TO: "support@example.com",
      CRON_SECRET: "cron-secret",
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.CRON_SECRET).toBe("cron-secret");
  });
});
