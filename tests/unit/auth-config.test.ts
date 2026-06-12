import { describe, expect, it } from "vitest";

import { resolveAuthSecret } from "@/auth.config";

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
