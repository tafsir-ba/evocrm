import { describe, expect, it } from "vitest";

import { signupInputSchema } from "@/server/validation/auth";

describe("signup validation", () => {
  it("rejects mismatched confirmPassword", () => {
    const result = signupInputSchema.safeParse({
      name: "QA User",
      email: "qa@example.com",
      password: "SecurePass123",
      confirmPassword: "DifferentPass9",
    });

    expect(result.success).toBe(false);
  });

  it("rejects password without a number", () => {
    const result = signupInputSchema.safeParse({
      name: "QA User",
      email: "qa@example.com",
      password: "SecurePasswordOnly",
      confirmPassword: "SecurePasswordOnly",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid signup input", () => {
    const result = signupInputSchema.safeParse({
      name: "QA User",
      email: "qa@example.com",
      password: "SecurePass123",
      confirmPassword: "SecurePass123",
    });

    expect(result.success).toBe(true);
  });
});
