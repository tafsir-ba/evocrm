import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/users", () => ({
  findUserByEmail: vi.fn(),
}));

vi.mock("@/server/services/users", () => ({
  syncUserFromProviderProfile: vi.fn(),
}));

import { findUserByEmail } from "@/server/repositories/users";
import { resolveGoogleSignInUserId } from "@/server/auth/google-sign-in";
import { syncUserFromProviderProfile } from "@/server/services/users";

describe("resolveGoogleSignInUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the synced user id when profile sync succeeds", async () => {
    vi.mocked(syncUserFromProviderProfile).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      email: "tafsir@evo-home.ch",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      resolveGoogleSignInUserId({
        email: "tafsir@evo-home.ch",
        name: "Tafsir Ba",
      }),
    ).resolves.toBe("507f1f77bcf86cd799439011");
  });

  it("falls back to an existing user when profile sync fails", async () => {
    vi.mocked(syncUserFromProviderProfile).mockRejectedValue(
      new Error("profile update failed"),
    );
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      email: "tafsir@evo-home.ch",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      resolveGoogleSignInUserId({
        email: "tafsir@evo-home.ch",
      }),
    ).resolves.toBe("507f1f77bcf86cd799439011");
  });
});
