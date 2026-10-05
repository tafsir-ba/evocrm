import { describe, expect, it } from "vitest";

import { isPublicPath, PUBLIC_PATHS } from "@/lib/public-paths";

describe("public path allowlist", () => {
  it("allows website lead capture and public lead stats under integrations", () => {
    expect(isPublicPath("/api/integrations/website/leads")).toBe(true);
    expect(isPublicPath("/api/integrations/website/stats/leads")).toBe(true);
    expect(isPublicPath("/api/integrations/hubspot/webhooks")).toBe(true);
    expect(isPublicPath("/api/integrations")).toBe(false);
    expect(isPublicPath("/api/integrations/other")).toBe(false);
  });

  it("keeps existing public auth, unsubscribe, and privacy cookie paths", () => {
    expect(PUBLIC_PATHS).toContain("/login");
    expect(PUBLIC_PATHS).toContain("/unsubscribe");
    expect(PUBLIC_PATHS).toContain("/api/unsubscribe");
    expect(PUBLIC_PATHS).toContain("/privacy-cookies");
    expect(isPublicPath("/api/unsubscribe")).toBe(true);
    expect(isPublicPath("/privacy-cookies")).toBe(true);
    expect(isPublicPath("/api/auth/signin")).toBe(true);
  });
});
