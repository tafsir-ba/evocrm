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

  it("falls back to user id when no DB user exists for the email", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const sub = await resolveJwtSub({
      userId: "credentials-user-1",
      email: "new@example.com",
    });

    expect(sub).toBe("credentials-user-1");
  });
});
