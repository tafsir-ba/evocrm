import { describe, expect, it } from "vitest";

import { isCanonicalSessionUserId } from "@/lib/session-user-id";

describe("isCanonicalSessionUserId", () => {
  it("accepts MongoDB ObjectId strings", () => {
    expect(isCanonicalSessionUserId("507f1f77bcf86cd799439011")).toBe(true);
  });

  it("rejects OAuth UUIDs and other non-ObjectId values", () => {
    expect(isCanonicalSessionUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      false,
    );
    expect(isCanonicalSessionUserId("")).toBe(false);
    expect(isCanonicalSessionUserId(undefined)).toBe(false);
  });
});
