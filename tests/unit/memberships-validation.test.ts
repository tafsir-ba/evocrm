import { describe, expect, it } from "vitest";

import { updateMembershipInputSchema } from "@/server/validation/memberships";

describe("memberships validation", () => {
  it("rejects invited status on PATCH schema", () => {
    const result = updateMembershipInputSchema.safeParse({ status: "invited" });

    expect(result.success).toBe(false);
  });

  it("accepts active, suspended, and removed on PATCH schema", () => {
    expect(updateMembershipInputSchema.safeParse({ status: "active" }).success).toBe(true);
    expect(updateMembershipInputSchema.safeParse({ status: "suspended" }).success).toBe(true);
    expect(updateMembershipInputSchema.safeParse({ status: "removed" }).success).toBe(true);
  });
});
