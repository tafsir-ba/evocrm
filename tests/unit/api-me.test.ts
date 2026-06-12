import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

import { GET } from "@/app/api/me/route";
import { requireAuth } from "@/server/auth/require-auth";

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when session is missing", async () => {
    const { AppError } = await import("@/server/errors");
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns authenticated user context", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User Name",
        image: "https://example.com/avatar.png",
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toEqual({
      id: "user-1",
      email: "user@example.com",
      name: "User Name",
      image: "https://example.com/avatar.png",
    });
  });
});
