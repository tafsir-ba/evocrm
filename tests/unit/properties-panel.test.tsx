import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/properties",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { PropertiesPanel } from "@/components/properties/properties-panel";

const statuses = [
  { id: "507f1f77bcf86cd799439071", label: "Disponible", color: "#10B981", key: "available" },
];

const types = [{ id: "507f1f77bcf86cd799439072", label: "Appartement", color: "#6366F1", key: "apt" }];

const sampleProperty = {
  id: "507f1f77bcf86cd799439081",
  title: "Attique Genève",
  reference: "AG-12",
  price: 1_250_000,
  currency: "CHF",
  rooms: 4.5,
  city: "Genève",
  createdAt: "2026-08-20T12:00:00.000Z",
  status: statuses[0],
  type: types[0],
  project: { id: "507f1f77bcf86cd799439061", name: "Les Terrasses", reference: "LT-01" },
  tagsResolved: [
    { id: "t1", name: "VIP", color: "#B45309" },
    { id: "t2", name: "Vue lac", color: "#1D4ED8" },
  ],
  assignedUser: {
    id: "507f1f77bcf86cd799439031",
    name: "Camille Müller",
    email: "camille@evo-home.ch",
  },
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function mockPropertiesFetch(properties: unknown[] = [sampleProperty]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/properties?") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ data: properties, pagination: { total: properties.length } });
    }
    if (url.includes("/dictionary-items?type=property_status")) {
      return jsonResponse({ data: { items: statuses } });
    }
    if (url.includes("/dictionary-items?type=property_type")) {
      return jsonResponse({ data: { items: types } });
    }
    if (url.includes("/tags?")) {
      return jsonResponse({ data: { tags: sampleProperty.tagsResolved } });
    }
    if (url.includes("/members")) {
      return jsonResponse({
        data: {
          members: [
            {
              userId: sampleProperty.assignedUser.id,
              name: sampleProperty.assignedUser.name,
              email: sampleProperty.assignedUser.email,
            },
          ],
        },
      });
    }
    return jsonResponse({ error: { message: "Not found" } }, 404);
  }) as typeof fetch;
}

describe("PropertiesPanel list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPropertiesFetch();
  });

  it("renders a compact operational row without empty image or redundant open links", async () => {
    render(
      <PropertiesPanel
        workspaceSlug="demo"
        defaultCurrency="CHF"
        canCreate
        canArchive
      />,
    );

    expect(await screen.findAllByText("Attique Genève")).not.toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Property" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rooms" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "City" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tags" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "View" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Attique Genève/ })).not.toBeInTheDocument();

    expect(screen.getAllByText("AG-12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Les Terrasses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Appartement").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disponible").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1[.,\u00a0\s’']?250[.,\u00a0\s’']?000/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("4.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Genève").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Camille Müller").length).toBeGreaterThan(0);
    expect(screen.getAllByText("VIP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);

    expect(screen.getAllByRole("link", { name: "Attique Genève" })[0]).toHaveAttribute(
      "href",
      "/w/demo/properties/507f1f77bcf86cd799439081",
    );
    expect(screen.getAllByRole("button", { name: "Archive" }).length).toBeGreaterThan(0);
  });

  it("hides rooms, tags, and type when those values are unused", async () => {
    mockPropertiesFetch([
      {
        ...sampleProperty,
        rooms: null,
        type: null,
        tagsResolved: [],
      },
    ]);

    render(
      <PropertiesPanel
        workspaceSlug="demo"
        defaultCurrency="CHF"
        canCreate={false}
        canArchive={false}
      />,
    );

    expect(await screen.findAllByText("Attique Genève")).not.toHaveLength(0);
    expect(screen.queryByRole("columnheader", { name: "Rooms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Tags" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Type" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("keeps search, filters, and pagination labels", async () => {
    const user = userEvent.setup();
    render(
      <PropertiesPanel workspaceSlug="demo" defaultCurrency="CHF" canCreate canArchive />,
    );

    const search = await screen.findByLabelText("Search properties by title, reference or city");
    await user.type(search, "Attique");
    expect(search).toHaveValue("Attique");
    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(await screen.findByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });
});
