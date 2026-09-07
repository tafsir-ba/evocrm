import { describe, expect, it } from "vitest";

import { isGoogleAuthConfigured, resolveAuthSecret } from "@/auth.config";

describe("resolveAuthSecret", () => {
  it("uses configured secret when present", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXTAUTH_SECRET: "prod-secret-value",
      }),
    ).toBe("prod-secret-value");
  });

  it("allows test fallback without configured secret", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "test",
        NEXTAUTH_SECRET: undefined,
      }),
    ).toBe("test-nextauth-secret-minimum-32-characters");
  });

  it("allows development fallback without configured secret", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "development",
        NEXTAUTH_SECRET: undefined,
      }),
    ).toBe("development-nextauth-secret-minimum-32");
  });

  it("allows build-only placeholder during production build", () => {
    expect(
      resolveAuthSecret(
        {
          NODE_ENV: "production",
          NEXTAUTH_SECRET: undefined,
        },
        { isProductionBuild: true },
      ),
    ).toBe("build-time-nextauth-secret-placeholder-32");
  });

  it("fails closed in production runtime without secret", () => {
    expect(() =>
      resolveAuthSecret({
        NODE_ENV: "production",
        NEXTAUTH_SECRET: undefined,
      }),
    ).toThrow(/NEXTAUTH_SECRET is required in production/);
  });
});

describe("isGoogleAuthConfigured", () => {
  it("is true when both Google client id and secret are set", () => {
    expect(
      isGoogleAuthConfigured({
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      }),
    ).toBe(true);
  });

  it("is false when either Google credential is missing", () => {
    expect(
      isGoogleAuthConfigured({
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: "google-secret",
      }),
    ).toBe(false);
    expect(
      isGoogleAuthConfigured({
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: undefined,
      }),
    ).toBe(false);
    expect(
      isGoogleAuthConfigured({
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
      }),
    ).toBe(false);
  });
});
