import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsPanel } from "@/components/projects/projects-panel";

const sampleProject = {
  id: "507f1f77bcf86cd799439061",
  name: "Les Terrasses",
  reference: "LT-01",
  city: "Genève",
  country: "Suisse",
  projectType: null,
  archivedAt: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  counts: {
    leads: 12,
    properties: 0,
    opportunities: 3,
    activeCampaigns: 0,
    lastActivityAt: "2026-08-29T09:00:00.000Z",
  },
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

describe("workspace ProjectsPanel list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () =>
      jsonResponse({ data: { projects: [sampleProject] } }),
    ) as typeof fetch;
  });

  it("renders a compact operational row from real project counts", async () => {
    render(
      <ProjectsPanel workspaceSlug="demo" canCreate canUpdate canArchive />,
    );

    expect(await screen.findAllByText("Les Terrasses")).not.toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Location" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Leads" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Activity" })).toBeInTheDocument();

    expect(screen.queryByRole("columnheader", { name: "Properties" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Dripping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View" })).not.toBeInTheDocument();

    expect(screen.getAllByText("LT-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Genève, Suisse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 pipeline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Les Terrasses" })[0]).toHaveAttribute(
      "href",
      "/w/demo/projects/507f1f77bcf86cd799439061",
    );
    expect(screen.getAllByRole("link", { name: "Edit" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Archive" }).length).toBeGreaterThan(0);
  });

  it("hides inventory and activity columns when those signals are empty", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        data: {
          projects: [
            {
              ...sampleProject,
              counts: {
                leads: 4,
                properties: 0,
                opportunities: 0,
                activeCampaigns: 0,
                lastActivityAt: null,
              },
            },
          ],
        },
      }),
    ) as typeof fetch;

    render(
      <ProjectsPanel workspaceSlug="demo" canCreate={false} canUpdate={false} canArchive={false} />,
    );

    expect(await screen.findAllByText("Les Terrasses")).not.toHaveLength(0);
    expect(screen.queryByRole("columnheader", { name: "Inventory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("keeps search and archived filters", async () => {
    const user = userEvent.setup();
    render(
      <ProjectsPanel workspaceSlug="demo" canCreate canUpdate canArchive />,
    );

    const search = await screen.findByLabelText("Search projects");
    await user.type(search, "Terrasses");
    expect(search).toHaveValue("Terrasses");
    expect(screen.getByLabelText("Show archived")).toBeInTheDocument();
  });
});
