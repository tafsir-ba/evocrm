import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    error.name = "NEXT_REDIRECT";
    throw error;
  }),
}));

import { GET } from "@/app/api/auth/clear-session/route";
import { auth, signOut } from "@/auth";
import { LOGIN_PATH } from "@/lib/session-user-id";
import { findUserById } from "@/server/repositories/users";

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

describe("GET /api/auth/clear-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a valid authenticated session and does not sign out", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        email: "owner@example.com",
      },
    });
    vi.mocked(findUserById).mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      email: "owner@example.com",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(GET()).rejects.toThrow("NEXT_REDIRECT:/workspaces");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("silently signs out when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await GET();

    expect(findUserById).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: LOGIN_PATH });
  });

  it("silently signs out a non-canonical JWT subject", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "stale@example.com",
      },
    });

    await GET();

    expect(findUserById).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: LOGIN_PATH });
  });

  it("silently signs out when the session user no longer exists", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        email: "gone@example.com",
      },
    });
    vi.mocked(findUserById).mockResolvedValue(null);

    await GET();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: LOGIN_PATH });
  });
});
