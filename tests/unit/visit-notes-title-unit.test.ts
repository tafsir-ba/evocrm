import { describe, expect, it } from "vitest";

import {
  deriveVisitSessionTitle,
  formatVisitSessionFallbackTitle,
} from "@/lib/visit-notes";
import { updateVisitSessionInputSchema } from "@/server/validation/visit-sessions";

describe("visit session titles", () => {
  it("derives a short title from first substantive text", () => {
    expect(deriveVisitSessionTitle("  Nice flat near the lake  ")).toBe(
      "Nice flat near the lake",
    );
    expect(
      deriveVisitSessionTitle(
        "This is a very long visit note that should be truncated for the conversation title in the drawer",
      ),
    ).toMatch(/…$/);
  });

  it("formats a fallback title from createdAt", () => {
    expect(
      formatVisitSessionFallbackTitle("2026-09-22T10:00:00.000Z"),
    ).toMatch(/^Note ·/);
  });
});

describe("visit session update validation", () => {
  it("accepts title rename and propertyId link without other fields", () => {
    expect(
      updateVisitSessionInputSchema.safeParse({
        title: "Site visit — Cressy",
      }).success,
    ).toBe(true);
    expect(
      updateVisitSessionInputSchema.safeParse({
        propertyId: "507f1f77bcf86cd799439011",
      }).success,
    ).toBe(true);
    expect(
      updateVisitSessionInputSchema.safeParse({
        propertyId: null,
      }).success,
    ).toBe(true);
  });
});
