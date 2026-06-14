import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";

vi.mock("@/server/repositories/users", () => ({
  findUserWithPasswordByEmail: vi.fn(),
  createCredentialsUser: vi.fn(),
  linkCredentialsToUser: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  createCredentialsUser,
  findUserWithPasswordByEmail,
  linkCredentialsToUser,
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
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue(null);
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

  it("links password to an existing Google-only account", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(linkCredentialsToUser).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
      authProvider: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await registerCredentialsUser({
      name: "QA User",
      email: "qa@example.com",
      password: "SecurePass123",
      confirmPassword: "SecurePass123",
    });

    expect(user.email).toBe("qa@example.com");
    expect(linkCredentialsToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "qa@example.com",
        name: "QA User",
        passwordHash: expect.not.stringMatching("SecurePass123"),
      }),
    );
    expect(createCredentialsUser).not.toHaveBeenCalled();
  });

  it("rejects signup when the email already has a password", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "credentials",
      passwordHash: await hashPassword("SecurePass123"),
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

  it("verifyCredentialsLogin accepts any user with a passwordHash", async () => {
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      name: "QA User",
      authProvider: "google",
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
        authProvider: "google",
      }),
    );
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("maps duplicate key errors from createCredentialsUser to CONFLICT", async () => {
    const { AppError: RepoAppError } = await import("@/server/errors");
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue(null);
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
    vi.mocked(findUserWithPasswordByEmail).mockResolvedValue({
      id: "user-1",
      email: "qa@example.com",
      authProvider: "credentials",
      passwordHash: await hashPassword("SecurePass123"),
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
