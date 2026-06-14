import { describe, expect, it } from "vitest";

import { isPublicPath, PUBLIC_PATHS } from "@/lib/public-paths";

describe("public path allowlist", () => {
  it("allows only the website lead webhook under integrations", () => {
    expect(isPublicPath("/api/integrations/website/leads")).toBe(true);
    expect(isPublicPath("/api/integrations")).toBe(false);
    expect(isPublicPath("/api/integrations/other")).toBe(false);
  });

  it("keeps existing public auth and unsubscribe paths", () => {
    expect(PUBLIC_PATHS).toContain("/login");
    expect(PUBLIC_PATHS).toContain("/unsubscribe");
    expect(isPublicPath("/api/auth/signin")).toBe(true);
  });
});
