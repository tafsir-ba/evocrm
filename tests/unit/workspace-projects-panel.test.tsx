import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/projects",
}));

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
    lastGenuineInboundAt: "2026-08-29T09:00:00.000Z",
    lastGenuineInboundBasis: "received_at",
  },
};

function jsonResponse(data: unknown, pagination?: { total: number }) {
  return {
    ok: true,
    status: 200,
    json: async () =>
      pagination
        ? { data, pagination: { page: 1, pageSize: 25, total: pagination.total, totalPages: 1 } }
        : { data },
  } as Response;
}

describe("workspace ProjectsPanel list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () =>
      jsonResponse([sampleProject], { total: 1 }),
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
    expect(screen.getByRole("columnheader", { name: "Last inbound" })).toBeInTheDocument();

    expect(screen.queryByRole("columnheader", { name: "Properties" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Dripping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View" })).not.toBeInTheDocument();

    expect(screen.getAllByText("LT-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Genève, Suisse").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 pipeline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/· received$/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Les Terrasses" })[0]).toHaveAttribute(
      "href",
      "/w/demo/projects/507f1f77bcf86cd799439061",
    );
    expect(screen.getAllByRole("link", { name: "Edit" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Archive" }).length).toBeGreaterThan(0);
  });

  it("hides inventory when empty and keeps last inbound auditable when demand is unknown", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        [
          {
            ...sampleProject,
            counts: {
              leads: 4,
              properties: 0,
              opportunities: 0,
              activeCampaigns: 0,
              lastActivityAt: "2026-08-30T09:00:00.000Z",
              lastGenuineInboundAt: null,
              lastGenuineInboundBasis: null,
            },
          },
        ],
        { total: 1 },
      ),
    ) as typeof fetch;

    render(
      <ProjectsPanel workspaceSlug="demo" canCreate={false} canUpdate={false} canArchive={false} />,
    );

    expect(await screen.findAllByText("Les Terrasses")).not.toHaveLength(0);
    expect(screen.queryByRole("columnheader", { name: "Inventory" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Last inbound" })).toBeInTheDocument();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs inbound date").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("columnheader", { name: "Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("shows attached workflows only on the project that owns them, never as dripping enrollment", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        [
          {
            ...sampleProject,
            id: "507f1f77bcf86cd799439061",
            name: "Grosvenor Vistas",
            reference: "GV",
            counts: {
              ...sampleProject.counts,
              opportunities: 0,
              activeCampaigns: 1,
            },
          },
          {
            ...sampleProject,
            id: "507f1f77bcf86cd799439062",
            name: "Bulk import site",
            reference: "IMP",
            counts: {
              ...sampleProject.counts,
              opportunities: 0,
              activeCampaigns: 0,
            },
          },
        ],
        { total: 2 },
      ),
    ) as typeof fetch;

    render(
      <ProjectsPanel workspaceSlug="demo" canCreate={false} canUpdate={false} canArchive={false} />,
    );

    expect(await screen.findAllByText("Grosvenor Vistas")).not.toHaveLength(0);
    expect(screen.getAllByText("1 workflow").length).toBeGreaterThan(0);
    expect(screen.queryByText(/dripping/i)).not.toBeInTheDocument();
    expect(screen.queryByText("1 dripping")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Inventory" })).toBeInTheDocument();
  });

  it("exposes demand views, search, pagination, and sortable inbound columns", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => jsonResponse([sampleProject], { total: 26 })) as typeof fetch;
    global.fetch = fetchMock;

    render(
      <ProjectsPanel workspaceSlug="demo" canCreate canUpdate canArchive />,
    );

    const search = await screen.findByLabelText("Search projects");
    await user.type(search, "Terrasses");
    expect(search).toHaveValue("Terrasses");

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stale" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByText("26 total")).toBeInTheDocument();
    expect(screen.getByText(/1–25 of 26/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Needs attention" }));
    expect(await screen.findByRole("tab", { name: "Needs attention" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const listCalls = vi.mocked(fetchMock).mock.calls.map((call) => String(call[0]));
    expect(listCalls.some((url) => url.includes("page=1") && url.includes("pageSize=25"))).toBe(
      true,
    );
    expect(listCalls.some((url) => url.includes("view=needs_attention"))).toBe(true);
    expect(listCalls.some((url) => url.includes("sort=inbound"))).toBe(true);
    expect(screen.queryByLabelText("Show archived")).not.toBeInTheDocument();
  });
});
