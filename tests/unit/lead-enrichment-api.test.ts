import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/server/workspaces/resolve-workspace", () => ({ resolveWorkspace: vi.fn() }));
vi.mock("@/server/permissions/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@/server/permissions/require-membership", () => ({ requireMembership: vi.fn() }));
vi.mock("@/server/services/lead-enrichment", () => ({
  getLeadEnrichmentForLead: vi.fn(),
  startLeadEnrichment: vi.fn(),
  revokeLeadEnrichment: vi.fn(),
}));

import { GET, POST, DELETE } from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/enrichment/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { requireMembership } from "@/server/permissions/require-membership";
import { startLeadEnrichment } from "@/server/services/lead-enrichment";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

const ctx = { params: Promise.resolve({ workspaceSlug: "demo", leadId: "lead-1" }) };

describe("lead enrichment API", () => {
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

  it("requires lead:enrich to start a run", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ allowedSources: ["company_website"] }),
      }),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(startLeadEnrichment).not.toHaveBeenCalled();
  });

  it("starts enrichment with lead:enrich", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockResolvedValue({
      membership: { permissions: ["lead:enrich"] },
    } as never);
    vi.mocked(startLeadEnrichment).mockResolvedValue({ id: "run-1", suggestions: [] } as never);

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ allowedSources: ["company_website"] }),
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "lead:enrich");
  });

  it("requires lead:enrich_revoke to delete enrichment data", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );
    const response = await DELETE(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(403);
  });

  it("allows GET when the member has lead:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(requireMembership).mockResolvedValue({
      permissions: ["lead:read"],
    } as never);
    const { getLeadEnrichmentForLead } = await import(
      "@/server/services/lead-enrichment"
    );
    vi.mocked(getLeadEnrichmentForLead).mockResolvedValue({
      capability: { enabled: false },
      overlay: {},
      runs: [],
    } as never);

    const response = await GET(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(200);
  });
});
