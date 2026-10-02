import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  getLeadForWorkspace: vi.fn().mockResolvedValue({ id: "lead-1" }),
}));

vi.mock("@/server/services/lead-enrichment", () => ({
  getLeadEnrichmentForLead: vi.fn(),
  startLeadEnrichment: vi.fn(),
  revokeLeadEnrichment: vi.fn(),
}));

import { GET, POST, DELETE } from "@/app/api/workspaces/[workspaceSlug]/leads/[leadId]/enrichment/route";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  getLeadEnrichmentForLead,
  startLeadEnrichment,
} from "@/server/services/lead-enrichment";
import { AppError } from "@/server/errors";

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

describe("lead enrichment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires lead:enrich to start a run", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
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
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue(access(["lead:enrich"]) as never);
    vi.mocked(startLeadEnrichment).mockResolvedValue({ id: "run-1", suggestions: [] } as never);

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "lead:enrich");
    expect(startLeadEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ allowedSources: undefined }),
    );
  });

  it("requires lead:enrich_revoke to delete enrichment data", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );
    const response = await DELETE(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(403);
  });

  it("allows GET when the member has lead:read", async () => {
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue(access(["lead:read"]) as never);
    vi.mocked(getLeadEnrichmentForLead).mockResolvedValue({
      capability: { enabled: false },
      overlay: { summary: { text: "accepted overlay" } },
      runs: [
        {
          id: "run-1",
          sources: [{ url: "https://example.com", title: "secret research" }],
          suggestions: [{ id: "sug-1", status: "proposed", proposedValue: "Hidden" }],
        },
      ],
    } as never);

    const response = await GET(new Request("http://localhost/api"), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.runs).toEqual([]);
    expect(body.data.overlay.summary.text).toBe("accepted overlay");
  });
});
