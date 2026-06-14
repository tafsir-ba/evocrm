import { describe, expect, it } from "vitest";

import {
  PLATFORM_ADMIN_EMAIL,
  isPlatformAdminEmail,
} from "@/server/auth/platform-admin";

describe("platform admin", () => {
  it("allows only the configured operator email", () => {
    expect(isPlatformAdminEmail(PLATFORM_ADMIN_EMAIL)).toBe(true);
    expect(isPlatformAdminEmail("Tafsir@Evo-Home.ch")).toBe(true);
  });

  it("rejects all other emails", () => {
    expect(isPlatformAdminEmail("ops@example.com")).toBe(false);
    expect(isPlatformAdminEmail("admin@example.com")).toBe(false);
    expect(isPlatformAdminEmail("")).toBe(false);
  });
});
