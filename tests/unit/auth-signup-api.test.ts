import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/credentials-auth", () => ({
  registerCredentialsUser: vi.fn(),
}));

import { POST } from "@/app/api/auth/signup/route";
import { registerCredentialsUser } from "@/server/services/credentials-auth";

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates input and returns VALIDATION_ERROR for weak password", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "QA",
          email: "qa@example.com",
          password: "short",
          confirmPassword: "short",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns created user without passwordHash", async () => {
    vi.mocked(registerCredentialsUser).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "QA User",
          email: "qa@example.com",
          password: "SecurePass123",
          confirmPassword: "SecurePass123",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.user).toEqual({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
    });
    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("returns CONFLICT for duplicate email", async () => {
    const { AppError } = await import("@/server/errors");
    vi.mocked(registerCredentialsUser).mockRejectedValue(
      new AppError("CONFLICT", "An account with this email already exists."),
    );

    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "QA User",
          email: "qa@example.com",
          password: "SecurePass123",
          confirmPassword: "SecurePass123",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });
});
