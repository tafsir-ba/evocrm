import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";

vi.mock("@/server/repositories/users", () => ({
  findUserByEmail: vi.fn(),
  findUserWithPasswordByEmail: vi.fn(),
  createCredentialsUser: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  createCredentialsUser,
  findUserByEmail,
  findUserWithPasswordByEmail,
} from "@/server/repositories/users";
import {
  hashPassword,
  registerCredentialsUser,
  verifyCredentialsLogin,
  verifyPassword,
} from "@/server/services/credentials-auth";

describe("credentials auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes password and never stores plaintext", async () => {
    const hash = await hashPassword("SecurePass123");
    expect(hash).not.toBe("SecurePass123");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies correct password against hash", async () => {
    const hash = await hashPassword("SecurePass123");
    expect(await verifyPassword("SecurePass123", hash)).toBe(true);
    expect(await verifyPassword("WrongPass1234", hash)).toBe(false);
  });

  it("registerCredentialsUser normalizes email and hashes password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createCredentialsUser).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await registerCredentialsUser({
      name: "QA User",
      email: "QA@Example.com",
      password: "SecurePass123",
      confirmPassword: "SecurePass123",
    });

    expect(user.email).toBe("qa@example.com");
    expect(createCredentialsUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "qa@example.com",
        name: "QA User",
        passwordHash: expect.not.stringMatching("SecurePass123"),
      }),
    );
  });

  it("rejects duplicate Google email with CONFLICT", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      registerCredentialsUser({
        name: "QA User",
        email: "qa@example.com",
        password: "SecurePass123",
        confirmPassword: "SecurePass123",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("verifyCredentialsLogin rejects wrong password without revealing existence", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "credentials",
      passwordHash: await hashPassword("SecurePass123"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(
      await verifyCredentialsLogin({
        email: "qa@example.com",
        password: "WrongPass1234",
      }),
    ).toBeNull();
  });

  it("verifyCredentialsLogin returns user without passwordHash", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
      authProvider: "credentials",
      passwordHash: await hashPassword("SecurePass123"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await verifyCredentialsLogin({
      email: "qa@example.com",
      password: "SecurePass123",
    });

    expect(user).toEqual(
      expect.objectContaining({
        id: "user-1",
        email: "qa@example.com",
        authProvider: "credentials",
      }),
    );
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("verifyCredentialsLogin rejects users without passwordHash", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(
      await verifyCredentialsLogin({
        email: "qa@example.com",
        password: "SecurePass123",
      }),
    ).toBeNull();
  });

  it("maps duplicate key errors from createCredentialsUser to CONFLICT", async () => {
    const { AppError: RepoAppError } = await import("@/server/errors");
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createCredentialsUser).mockRejectedValue(
      new RepoAppError("CONFLICT", "An account with this email already exists."),
    );

    await expect(
      registerCredentialsUser({
        name: "QA User",
        email: "qa@example.com",
        password: "SecurePass123",
        confirmPassword: "SecurePass123",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("registerCredentialsUser rejects duplicate credentials email", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      registerCredentialsUser({
        name: "QA User",
        email: "qa@example.com",
        password: "SecurePass123",
        confirmPassword: "SecurePass123",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
