import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

const mockCreate = vi.fn();

vi.mock("@/models/user", () => ({
  UserModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

import { createCredentialsUser, findUserById } from "@/server/repositories/users";
import { UserModel } from "@/models/user";

describe("users repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps Mongo duplicate key errors to CONFLICT", async () => {
    mockCreate.mockRejectedValue({ code: 11000 });

    await expect(
      createCredentialsUser({
        email: "qa@example.com",
        name: "QA User",
        passwordHash: "$2a$12$hashedvalue",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does not return passwordHash from createCredentialsUser", async () => {
    mockCreate.mockResolvedValue({
      toObject: () => ({
        _id: { toString: () => "user-1" },
        email: "qa@example.com",
        name: "QA User",
        authProvider: "credentials",
        passwordHash: "$2a$12$hashedvalue",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    const user = await createCredentialsUser({
      email: "qa@example.com",
      name: "QA User",
      passwordHash: "$2a$12$hashedvalue",
    });

    expect(user).not.toHaveProperty("passwordHash");
    expect(user.authProvider).toBe("credentials");
  });

  it("rethrows non-duplicate errors from createCredentialsUser", async () => {
    mockCreate.mockRejectedValue(new AppError("INTERNAL_ERROR", "Database failed.", {
      expose: false,
    }));

    await expect(
      createCredentialsUser({
        email: "qa@example.com",
        name: "QA User",
        passwordHash: "$2a$12$hashedvalue",
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("returns null for non-ObjectId user ids without querying the database", async () => {
    const user = await findUserById("550e8400-e29b-41d4-a716-446655440000");

    expect(user).toBeNull();
    expect(UserModel.findById).not.toHaveBeenCalled();
  });
});
