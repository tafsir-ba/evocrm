import { describe, expect, it } from "vitest";

import { appendSlugSuffix, slugifyName } from "@/server/workspaces/slug";

describe("workspace slug helpers", () => {
  it("slugifyName produces URL-safe slugs", () => {
    expect(slugifyName("EvoHome CRM")).toBe("evohome-crm");
    expect(slugifyName("  Hello   World!  ")).toBe("hello-world");
    expect(slugifyName("")).toBe("workspace");
  });

  it("appendSlugSuffix keeps slug within max length", () => {
    const longBase = "a".repeat(48);
    const result = appendSlugSuffix(longBase, 12);
    expect(result.endsWith("-12")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
