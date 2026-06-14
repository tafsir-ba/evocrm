import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/users", () => ({
  findUserByEmail: vi.fn(),
}));

import { resolveJwtSub } from "@/server/auth/resolve-jwt-sub";
import { findUserByEmail } from "@/server/repositories/users";

describe("resolveJwtSub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the DB user id by email over OAuth transient user id", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "mongo-user-1",
      email: "tafsir@evo-home.ch",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sub = await resolveJwtSub({
      userId: "oauth-random-uuid",
      email: "tafsir@evo-home.ch",
    });

    expect(sub).toBe("mongo-user-1");
  });

  it("repairs stale JWT subs from token email on session refresh", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      email: "tafsir@evo-home.ch",
      authProvider: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sub = await resolveJwtSub({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "tafsir@evo-home.ch",
    });

    expect(sub).toBe("507f1f77bcf86cd799439011");
  });

  it("falls back to user id when no DB user exists for the email", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const sub = await resolveJwtSub({
      userId: "credentials-user-1",
      email: "new@example.com",
    });

    expect(sub).toBe("credentials-user-1");
  });
});
