import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  getLeadForWorkspace: vi.fn().mockResolvedValue({ id: "lead-1" }),
}));

vi.mock("@/server/services/lead-financial-situation", () => ({
  getFinancialSituationForLead: vi.fn(),
  updateFinancialSituationForLead: vi.fn(),
  deleteFinancialSituationForLead: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/financial-situation/route";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { getFinancialSituationForLead } from "@/server/services/lead-financial-situation";
import { AppError } from "@/server/errors";
import { MARKET_INCOME_DISCLAIMER } from "@/lib/lead-financial-situation";

const ctx = { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) };

const workspace = {
  id: "ws-1",
  slug: "demo",
  name: "Demo",
  timezone: "UTC",
  defaultCurrency: "CHF",
};

function access(permissions: string[]) {
  return {
    userId: "user-1",
    workspace,
    membership: {
      id: "m1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active" as const,
      permissions,
    },
    permissions,
    accessMode: "member" as const,
    isWorkspaceAdmin: false,
  };
}

describe("financial situation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forbids agents without financial_read", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );
    const response = await GET(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(403);
    expect(getFinancialSituationForLead).not.toHaveBeenCalled();
  });

  it("returns snapshot and decision disclaimer", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue(
      access(["lead:financial_read"]) as never,
    );
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
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:financial_read");
  });

  it("requires financial_update to patch", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
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
