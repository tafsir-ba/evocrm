import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/dripping",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { CampaignsPanel } from "@/components/campaigns/campaigns-panel";

const sampleCampaign = {
  id: "c1",
  name: "Genève Printemps",
  status: "active" as const,
  audienceType: "leads" as const,
  frequency: "weekly",
  defaultFromName: "EvoHome",
  stepCount: 4,
  enrollmentCount: 18,
  updatedAt: "2026-08-29T12:00:00.000Z",
};

describe("CampaignsPanel compact list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ data: [sampleCampaign], pagination: { total: 1 } }),
      }) as Response,
    ) as typeof fetch;
  });

  it("renders a compact campaign row without a redundant Apply control", async () => {
    render(
      <CampaignsPanel workspaceSlug="demo" canCreate canUpdate canArchive />,
    );

    expect(await screen.findAllByText("Genève Printemps")).not.toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Campaign" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Enrolled" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Genève Printemps" })[0]).toHaveAttribute(
      "href",
      "/w/demo/dripping/c1",
    );
    expect(screen.getAllByRole("link", { name: "Analytics" })[0]).toHaveAttribute(
      "href",
      "/w/demo/dripping/c1/analytics",
    );
  });
});
