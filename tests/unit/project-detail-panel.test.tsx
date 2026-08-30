import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetailPanel } from "@/components/projects/project-detail-panel";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  } as Response;
}

describe("ProjectDetailPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () =>
      jsonResponse({
        project: {
          id: "507f1f77bcf86cd7994390dd",
          name: "Les Terrasses",
          reference: "LT-01",
          projectType: "development",
          commercialStage: "pre_launch",
          website: "https://example.com",
          address: "Quai du Mont-Blanc",
          city: "Geneva",
          country: "Switzerland",
          location: {
            countryCode: "CH",
            countryName: "Switzerland",
            cantonCode: "GE",
            cantonName: "Genève",
            postalCode: "1201",
            municipality: "Geneva",
            normalizedAddress: "Quai du Mont-Blanc",
            latitude: null,
            longitude: null,
            precision: "address",
            sourceUrl: null,
            confidence: null,
            reviewStatus: "verified",
            provenance: null,
          },
          companies: [
            {
              companyId: "507f1f77bcf86cd7994390aa",
              role: "developer",
              isPrimary: true,
              company: { id: "507f1f77bcf86cd7994390aa", name: "Promotor SA" },
            },
          ],
          description: "Lakefront residences",
          archivedAt: null,
          companyPeople: [
            {
              id: "507f1f77bcf86cd7994390ee",
              companyId: "507f1f77bcf86cd7994390aa",
              projectId: "507f1f77bcf86cd7994390dd",
              fullName: "Marie Dupont",
              email: "marie@promotor.example",
            },
          ],
          associablePeople: [
            {
              id: "507f1f77bcf86cd7994390ff",
              companyId: null,
              projectId: "507f1f77bcf86cd7994390dd",
              fullName: "Jean Client",
              email: "jean@example.com",
            },
          ],
        },
      }),
    ) as typeof fetch;
  });

  it("shows commercial stage and developer instead of a fake Active badge", async () => {
    render(
      <ProjectDetailPanel
        workspaceSlug="demo"
        projectId="507f1f77bcf86cd7994390dd"
        canUpdate
        canArchive
      />,
    );

    expect(await screen.findByText("Les Terrasses")).toBeInTheDocument();
    expect(screen.getByText("Pre-launch")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Primary company")).toBeInTheDocument();
    expect(screen.getByText("Promotor SA")).toBeInTheDocument();
    expect(screen.getByText("Developer / client")).toBeInTheDocument();
    expect(screen.getByText("Marie Dupont")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Jean Client/ })).toBeInTheDocument();
    expect(screen.getByText(/Quai du Mont-Blanc/)).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});
