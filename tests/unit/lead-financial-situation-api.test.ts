import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/server/workspaces/resolve-workspace", () => ({ resolveWorkspace: vi.fn() }));
vi.mock("@/server/permissions/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@/server/services/lead-financial-situation", () => ({
  getFinancialSituationForLead: vi.fn(),
  updateFinancialSituationForLead: vi.fn(),
  deleteFinancialSituationForLead: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/financial-situation/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { getFinancialSituationForLead } from "@/server/services/lead-financial-situation";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";
import { MARKET_INCOME_DISCLAIMER } from "@/lib/lead-financial-situation";

const ctx = { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) };

describe("financial situation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "CHF",
    });
  });

  it("forbids agents without financial_read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );
    const response = await GET(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(403);
    expect(getFinancialSituationForLead).not.toHaveBeenCalled();
  });

  it("returns snapshot and decision disclaimer", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockResolvedValue({
      membership: { permissions: ["lead:financial_read"] },
    } as never);
    vi.mocked(getFinancialSituationForLead).mockResolvedValue({
      record: null,
      snapshot: {
        declaredAnnualIncome: 120000,
        employmentType: "employed",
        availableDepositEquity: null,
        targetPurchasePrice: null,
        financingNeed: null,
        existingCommitments: null,
        affordabilityNotes: null,
        currency: "CHF",
        source: "declared_by_lead",
        asOfDate: "2026-08-01",
        confidence: "medium",
        assessorNotes: null,
      },
      disclaimer: MARKET_INCOME_DISCLAIMER,
    });

    const response = await GET(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.disclaimer).toMatch(/occupational working figure/i);
    expect(body.data.disclaimer).toMatch(/not this person/i);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "lead:financial_read");
  });

  it("requires financial_update to patch", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );
    const response = await PATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        body: JSON.stringify({ declaredAnnualIncome: 1 }),
      }),
      ctx,
    );
    expect(response.status).toBe(403);
  });
});
