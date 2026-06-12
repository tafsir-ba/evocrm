import { afterEach, describe, expect, it } from "vitest";

import { parseEnv, resetEnvCacheForTests } from "@/server/env";

const baseEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  MONGODB_URI: "mongodb://localhost:27017/evocrm_test",
};

describe("parseEnv", () => {
  afterEach(() => {
    resetEnvCacheForTests();
  });

  it("parses Phase 0 required variables", () => {
    const env = parseEnv(baseEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.MONGODB_URI).toBe("mongodb://localhost:27017/evocrm_test");
  });

  it("allows later-phase variables to be omitted", () => {
    const env = parseEnv(baseEnv);

    expect(env.NEXTAUTH_SECRET).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("parses optional variables when provided", () => {
    const env = parseEnv({
      ...baseEnv,
      NEXTAUTH_SECRET: "secret",
      CRON_SECRET: "cron-secret",
    });

    expect(env.NEXTAUTH_SECRET).toBe("secret");
    expect(env.CRON_SECRET).toBe("cron-secret");
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        NODE_ENV: "staging",
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects missing MONGODB_URI", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
