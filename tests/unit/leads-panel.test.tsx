import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads",
}));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => null,
}));

import { LeadsPanel } from "@/components/leads/leads-panel";

const statuses = [
  { id: "507f1f77bcf86cd799439021", label: "Nouveau", color: "#3B82F6", key: "new" },
  { id: "507f1f77bcf86cd799439022", label: "Qualifié", color: "#10B981", key: "qualified" },
];

const members = [
  { userId: "507f1f77bcf86cd799439031", name: "Camille Müller", email: "camille@evo-home.ch" },
  { userId: "507f1f77bcf86cd799439032", name: "Léa Dupont", email: "lea@evo-home.ch" },
];

const sampleLead = {
  id: "507f1f77bcf86cd799439011",
  fullName: "François Côté",
  email: "françois@évohome.ch",
  phone: "+41 79 123 45 67",
  createdAt: "2026-08-27T12:00:00.000Z",
  archivedAt: null,
  statusId: statuses[0].id,
  attributes: {
    integration: {
      utm: { campaign: "Genève-Printemps", source: "google", medium: "cpc" },
    },
  },
  status: statuses[0],
  source: { id: "507f1f77bcf86cd799439041", label: "Site web", color: "#6366F1", key: "website" },
  project: { id: "507f1f77bcf86cd799439051", name: "Les Terrasses", reference: "LT-01" },
  tagsResolved: [
    { id: "t1", name: "VIP", color: "#B45309" },
    { id: "t2", name: "Genève", color: "#1D4ED8" },
    { id: "t3", name: "Chalet", color: "#0F766E" },
  ],
  assignedUser: {
    id: members[0].userId,
    name: members[0].name,
    email: members[0].email,
  },
  lastActivity: {
    id: "a1",
    title: "Appel François",
    at: "2026-08-28T12:00:00.000Z",
  },
  nextAction: {
    id: "a2",
    title: "Relance Genève",
    at: "2026-08-31T09:00:00.000Z",
  },
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function mockLeadsFetch(leads: unknown[] = [sampleLead]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/leads?") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ data: leads, pagination: { total: leads.length } });
    }
    if (url.includes("/dictionary-items?type=lead_status")) {
      return jsonResponse({ data: { items: statuses } });
    }
    if (url.includes("/dictionary-items?type=lead_source")) {
      return jsonResponse({ data: { items: [sampleLead.source] } });
    }
    if (url.includes("/tags?")) {
      return jsonResponse({ data: { tags: sampleLead.tagsResolved } });
    }
    if (url.includes("/integrations")) {
      return jsonResponse({ data: { integrations: [{ id: "int-1", name: "evo-home.ch" }] } });
    }
    if (url.includes("/members")) {
      return jsonResponse({ data: { members } });
    }
    if (url.includes("/leads/") && init?.method === "PATCH") {
      return jsonResponse({ data: { lead: sampleLead } });
    }
    return jsonResponse({ error: { message: "Not found" } }, 404);
  }) as typeof fetch;
}

describe("LeadsPanel table", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLeadsFetch();
  });

  it("renders a triage table from real lead fields including French text and UTM", async () => {
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    expect(await screen.findAllByText("François Côté")).not.toHaveLength(0);
    expect(screen.getAllByRole("columnheader", { name: "Lead" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tags" })).toBeInTheDocument();

    expect(screen.getAllByText("Les Terrasses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Site web").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Genève-Printemps/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nouveau").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Appel François/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Relance Genève/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("VIP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);

    const mail = screen.getAllByRole("link", { name: /françois@évohome.ch/i })[0];
    expect(mail).toHaveAttribute("href", "mailto:françois@évohome.ch");
    const phone = screen.getAllByRole("link", { name: /\+41 79 123 45 67/ })[0];
    expect(phone).toHaveAttribute("href", "tel:+41791234567");
    expect(screen.getAllByRole("link", { name: "Open François Côté" }).length).toBeGreaterThan(0);
  });

  it("keeps existing filters and only shows supported quick actions", async () => {
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    expect(await screen.findByPlaceholderText("Search leads by name, email or phone…")).toBeInTheDocument();
    expect(screen.getByLabelText("Show archived")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All statuses")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All sources")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All tags")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All websites")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("UTM campaign")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All property types")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All intents")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All usage purposes")).toBeInTheDocument();

    expect(screen.getAllByLabelText("Change status for François Côté").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Assign François Côté").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Archive" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /whatsapp|call now|email blast/i })).not.toBeInTheDocument();
  });

  it("patches status and assignment through the existing lead update API", async () => {
    const user = userEvent.setup();
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    const statusSelect = await screen.findAllByLabelText("Change status for François Côté");
    await user.selectOptions(statusSelect[0]!, statuses[1].id);

    await waitFor(() => {
      const patchCall = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => init && typeof init === "object" && init.method === "PATCH");
      expect(patchCall).toBeTruthy();
      expect(String(patchCall?.[0])).toContain("/api/workspaces/demo/leads/507f1f77bcf86cd799439011");
      expect(patchCall?.[1]).toEqual(
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ statusId: statuses[1].id }),
        }),
      );
    });

    const assignSelect = screen.getAllByLabelText("Assign François Côté");
    await user.selectOptions(assignSelect[0]!, members[1].userId);

    await waitFor(() => {
      const assignCall = vi
        .mocked(fetch)
        .mock.calls.find(
          ([, init]) =>
            init &&
            typeof init === "object" &&
            init.method === "PATCH" &&
            String(init.body).includes("assignedTo"),
        );
      expect(assignCall?.[1]).toEqual(
        expect.objectContaining({
          body: JSON.stringify({ assignedTo: members[1].userId }),
        }),
      );
    });
  });

  it("hides assign and status controls when the user cannot update leads", async () => {
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate={false}
        canArchive={false}
        canDelete={false}
        canUpdate={false}
      />,
    );

    expect(await screen.findAllByText("François Côté")).not.toHaveLength(0);
    expect(screen.queryByLabelText("Change status for François Côté")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assign François Côté")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Camille Müller").length).toBeGreaterThan(0);
  });

  it("still supports archived restore without inventing extra row controls", async () => {
    mockLeadsFetch([{ ...sampleLead, archivedAt: "2026-08-29T12:00:00.000Z" }]);
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    expect(await screen.findAllByRole("button", { name: "Restore" })).not.toHaveLength(0);
    expect(screen.queryByLabelText("Change status for François Côté")).not.toBeInTheDocument();
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
  });
});
