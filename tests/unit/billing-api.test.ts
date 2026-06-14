import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/billing", () => ({
  getBillingShell: vi.fn(),
}));

import { GET as getBilling } from "@/app/api/workspaces/[workspaceSlug]/billing/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { getBillingShell } from "@/server/services/billing";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("billing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns billing shell for billing:manage", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["billing:manage"],
      },
    });
    vi.mocked(getBillingShell).mockResolvedValue({
      planName: "Beta (placeholder)",
      planStatus: "No active subscription",
      billingOwner: "Workspace owner",
      stripeConnected: false,
      message: "Stripe integration is planned for a later release.",
    });

    const response = await getBilling(
      new Request("http://localhost/api/workspaces/demo/billing"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "billing:manage");
    const body = await response.json();
    expect(body.data.billing.stripeConnected).toBe(false);
    expect(body.data.billing.planName).not.toContain("sk_");
  });

  it("denies billing without billing:manage", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getBilling(
      new Request("http://localhost/api/workspaces/demo/billing"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });
});
