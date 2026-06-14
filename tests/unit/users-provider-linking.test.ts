import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();

vi.mock("@/models/user", () => ({
  UserModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

import { upsertUserFromProvider } from "@/server/repositories/users";

describe("upsertUserFromProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates profile for an existing credentials user without clearing password auth", async () => {
    mockFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: { toString: () => "user-1" },
          email: "tafsir@evo-home.ch",
          name: "Tafsir",
          authProvider: "credentials",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    });
    mockFindOneAndUpdate.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: { toString: () => "user-1" },
          email: "tafsir@evo-home.ch",
          name: "Tafsir Ba",
          image: "https://example.com/avatar.png",
          authProvider: "credentials",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    });

    const user = await upsertUserFromProvider({
      email: "tafsir@evo-home.ch",
      name: "Tafsir Ba",
      image: "https://example.com/avatar.png",
    });

    expect(user.authProvider).toBe("credentials");
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { email: "tafsir@evo-home.ch" },
      {
        $set: {
          name: "Tafsir Ba",
          image: "https://example.com/avatar.png",
        },
      },
      { new: true, runValidators: true },
    );
  });
});
