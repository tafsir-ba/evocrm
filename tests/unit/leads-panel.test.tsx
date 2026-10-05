import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/w/demo/leads",
}));

const projectFilterState = vi.hoisted(() => ({ current: null as string | null }));

vi.mock("@/lib/use-workspace-project-filter", () => ({
  useWorkspaceProjectFilter: () => projectFilterState.current,
}));

import { LeadsPanel } from "@/components/leads/leads-panel";

const statuses = [
  {
    id: "507f1f77bcf86cd799439021",
    label: "Nouveau",
    color: "#3B82F6",
    key: "new",
    dictionaryId: "507f1f77bcf86cd799439020",
  },
  {
    id: "507f1f77bcf86cd799439022",
    label: "Qualifié",
    color: "#10B981",
    key: "qualified",
    dictionaryId: "507f1f77bcf86cd799439020",
  },
];

const activityTypes = [
  { id: "507f1f77bcf86cd799439071", key: "note", label: "Note" },
  { id: "507f1f77bcf86cd799439072", key: "task", label: "Task" },
];

const activityStatuses = [
  { id: "507f1f77bcf86cd799439081", key: "completed", label: "Completed", behavior: "completed" },
  { id: "507f1f77bcf86cd799439082", key: "pending", label: "Pending", behavior: "pending" },
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
  company: { id: "507f1f77bcf86cd799439061", name: "EvoHome SA" },
  jobTitle: "Buyer",
  industry: "Hospitality",
  stateRegion: "Geneva",
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
    at: "2026-08-20T09:00:00.000Z",
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
    if (url.includes("/dictionary-items?type=activity_type")) {
      return jsonResponse({ data: { items: activityTypes } });
    }
    if (url.includes("/dictionary-items?type=activity_status")) {
      return jsonResponse({ data: { items: activityStatuses } });
    }
    if (url.endsWith("/dictionary-items") && init?.method === "POST") {
      const payload = JSON.parse(String(init.body)) as { label: string; key: string; color: string };
      return jsonResponse(
        {
          data: {
            item: {
              id: "507f1f77bcf86cd799439023",
              dictionaryId: statuses[0].dictionaryId,
              ...payload,
            },
          },
        },
        201,
      );
    }
    if (url.endsWith("/activities") && init?.method === "POST") {
      return jsonResponse({ data: { activity: { id: "act-1" } } }, 201);
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
    if (url.includes("/companies")) {
      return jsonResponse({ data: { companies: [] } });
    }
    if (url.includes("/leads/") && init?.method === "PATCH") {
      return jsonResponse({ data: { lead: sampleLead } });
    }
    return jsonResponse({ error: { message: "Not found" } }, 404);
  }) as typeof fetch;
}

async function expandDesktopRow(user: ReturnType<typeof userEvent.setup>) {
  const expandButtons = await screen.findAllByRole("button", {
    name: "Show details for François Côté",
  });
  await user.click(expandButtons[0]!);
}

describe("LeadsPanel table", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    projectFilterState.current = null;
    mockLeadsFetch();
  });

  it("renders a single-line triage table without permanent contact or assign controls", async () => {
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
    expect(screen.getByRole("columnheader", { name: "Lead" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Age" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Urgency" })).toBeInTheDocument();

    expect(screen.getAllByText("EvoHome SA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Les Terrasses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Site web").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nouveau").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Camille Müller").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Relance Genève/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("VIP").length).toBeGreaterThan(0);

    expect(screen.queryByText("françois@évohome.ch")).not.toBeInTheDocument();
    const phoneLinks = screen.getAllByRole("link", { name: "+41 79 123 45 67" });
    expect(phoneLinks.length).toBeGreaterThan(0);
    expect(phoneLinks[0]).toHaveAttribute("href", "tel:+41791234567");
    expect(screen.queryByText(/Genève-Printemps/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Change status for François Côté" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Assign François Côté")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Contact François Côté" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open François Côté" }).length).toBeGreaterThan(0);
  });

  it("scrolls lead rows inside the table so pagination stays pinned", async () => {
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

    const scroller = screen.getByTestId("leads-table-scroll");
    const nextPage = screen.getByRole("button", { name: "Next page" });

    expect(scroller).toHaveClass("overflow-auto");
    expect(scroller).toHaveClass("min-h-0");
    expect(scroller).toHaveClass("flex-1");
    expect(scroller.contains(nextPage)).toBe(false);
  });

  it("reveals contact channels from the compact icon popover", async () => {
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

    const contactButtons = await screen.findAllByRole("button", {
      name: "Contact François Côté",
    });
    await user.click(contactButtons[0]!);

    const mail = await screen.findByRole("menuitem", { name: /françois@évohome.ch/i });
    expect(mail).toHaveAttribute("href", "mailto:françois@évohome.ch");
    const phone = screen.getByRole("menuitem", { name: /\+41 79 123 45 67/ });
    expect(phone).toHaveAttribute("href", "tel:+41791234567");
  });

  it("keeps existing filters and only exposes supported actions after row open", async () => {
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

    expect(await screen.findByPlaceholderText("Search leads by name, email or phone…")).toBeInTheDocument();
    expect(screen.getByLabelText("Show archived")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All statuses")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All sources")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All assigned")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("All tags")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More filters" }));
    expect(screen.getByDisplayValue("All tags")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All websites")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("UTM campaign")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All property types")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All intents")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All usage purposes")).toBeInTheDocument();

    await expandDesktopRow(user);

    expect(screen.getAllByLabelText("Assign François Côté").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Archive" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Genève-Printemps/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /whatsapp|call now|email blast/i })).not.toBeInTheDocument();
  });

  it("folds filters behind a mobile Filters toggle that counts active filters", async () => {
    const user = userEvent.setup();
    render(<LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate />);

    await screen.findByPlaceholderText("Search leads by name, email or phone…");
    const toggle = screen.getByRole("button", { name: "Filters" });
    const filters = document.getElementById("leads-filters");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(filters).toHaveClass("hidden", "sm:contents");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(filters).not.toHaveClass("hidden");

    await user.click(screen.getByLabelText("Show archived"));
    expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
  });

  it("changes status from the inline status dropdown and assignment after row open", async () => {
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

    const statusButtons = await screen.findAllByRole("button", {
      name: "Change status for François Côté",
    });
    await user.click(statusButtons[0]!);
    const statusDialog = await screen.findByRole("dialog", { name: "Status for François Côté" });
    await user.click(within(statusDialog).getByRole("option", { name: "Qualifié" }));

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

    await expandDesktopRow(user);
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

  it("creates a reusable workspace status from the dropdown and applies it to the lead", async () => {
    const user = userEvent.setup();
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
        canManageStatuses
      />,
    );

    const statusButtons = await screen.findAllByRole("button", {
      name: "Change status for François Côté",
    });
    await user.click(statusButtons[0]!);
    await user.type(screen.getByLabelText("Find or create a status"), "Visite planifiée");
    await user.click(screen.getByRole("button", { name: "Create status “Visite planifiée”" }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const createCall = calls.find(
        ([input, init]) => String(input).endsWith("/dictionary-items") && init?.method === "POST",
      );
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual(
        expect.objectContaining({
          dictionaryId: statuses[0].dictionaryId,
          type: "lead_status",
          label: "Visite planifiée",
          key: "visite_planifi_e",
        }),
      );
      const patchCall = calls.find(([, init]) => init?.method === "PATCH");
      expect(patchCall?.[1]?.body).toBe(JSON.stringify({ statusId: "507f1f77bcf86cd799439023" }));
    });
  });

  it("keeps the status dropdown open with an error when a created status cannot be applied", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/leads/") && init?.method === "PATCH") {
        return jsonResponse({ error: { message: "Lead update failed." } }, 500);
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    render(
      <LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate canManageStatuses />,
    );

    const statusButtons = await screen.findAllByRole("button", {
      name: "Change status for François Côté",
    });
    await user.click(statusButtons[0]!);
    await user.type(screen.getByLabelText("Find or create a status"), "Visite planifiée");
    await user.click(screen.getByRole("button", { name: "Create status “Visite planifiée”" }));

    const dialog = await screen.findByRole("dialog", { name: "Status for François Côté" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Status “Visite planifiée” was created but not applied to this lead.",
    );
  });

  it("only lets status managers create statuses", async () => {
    const user = userEvent.setup();
    render(
      <LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate />,
    );

    const statusButtons = await screen.findAllByRole("button", {
      name: "Change status for François Côté",
    });
    await user.click(statusButtons[0]!);
    await user.type(screen.getByLabelText("Find a status"), "Visite");
    expect(screen.queryByRole("button", { name: /Create status/ })).not.toBeInTheDocument();
    expect(screen.getByText("No matching status.")).toBeInTheDocument();
  });

  it("captures a quick note from the Next column as a lead note activity", async () => {
    const user = userEvent.setup();
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
        canCreateNotes
      />,
    );

    const noteButtons = await screen.findAllByRole("button", {
      name: "Add quick note for François Côté",
    });
    await user.click(noteButtons[0]!);
    await user.type(screen.getByLabelText("Note"), "Rappelé sur WhatsApp");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      const noteCall = vi
        .mocked(fetch)
        .mock.calls.find(
          ([input, init]) => String(input).endsWith("/activities") && init?.method === "POST",
        );
      expect(JSON.parse(String(noteCall?.[1]?.body))).toEqual(
        expect.objectContaining({
          leadId: sampleLead.id,
          typeId: activityTypes[0].id,
          statusId: activityStatuses[0].id,
          title: "Rappelé sur WhatsApp",
          description: "Rappelé sur WhatsApp",
        }),
      );
    });
    expect(screen.queryByRole("dialog", { name: "Quick note for François Côté" })).not.toBeInTheDocument();
  });

  it("hides quick notes when the user cannot create activities", async () => {
    render(<LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate />);

    expect(await screen.findAllByText("François Côté")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add quick note for François Côté" })).not.toBeInTheDocument();
  });

  it("enriches a lead from its row and requests the market estimate after a unique match", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/leads/${sampleLead.id}/enrichment`) && init?.method === "POST") {
        return jsonResponse({
          data: {
            run: {
              id: "run-1",
              status: "accepted",
              identityMatch: "unique",
              identityRationale: null,
              failureMessage: null,
              demoMode: false,
              candidates: [],
              selectedCandidateId: null,
            },
          },
        });
      }
      if (url.endsWith(`/leads/${sampleLead.id}`) && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          data: {
            lead: { ...sampleLead, city: "Genève", country: "Switzerland", jobTitle: "Buyer" },
          },
        });
      }
      if (url.endsWith("/financial-situation/market-estimate") && init?.method === "POST") {
        return jsonResponse({ data: { estimate: {} } });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
        canEnrich
        canRequestMarketEstimate
      />,
    );

    const enrichButtons = await screen.findAllByRole("button", { name: "Enrich François Côté" });
    await user.click(enrichButtons[0]!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      expect(
        calls.some(
          ([input, init]) =>
            String(input) === `/api/workspaces/demo/leads/${sampleLead.id}/enrichment` &&
            init?.method === "POST",
        ),
      ).toBe(true);
      expect(
        calls.some(
          ([input, init]) =>
            String(input).endsWith("/financial-situation/market-estimate") &&
            init?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("hides the enrich action without enrichment access or on archived leads", async () => {
    const { unmount } = render(
      <LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate />,
    );
    expect(await screen.findAllByText("François Côté")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Enrich François Côté" })).not.toBeInTheDocument();
    unmount();

    mockLeadsFetch([{ ...sampleLead, archivedAt: "2026-08-29T12:00:00.000Z" }]);
    render(<LeadsPanel workspaceSlug="demo" canCreate canArchive canDelete canUpdate canEnrich />);
    expect(await screen.findAllByText("François Côté")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Enrich François Côté" })).not.toBeInTheDocument();
  });

  it("hides assign and status controls when the user cannot update leads", async () => {
    const user = userEvent.setup();
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
    await expandDesktopRow(user);
    expect(screen.queryByLabelText("Change status for François Côté")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assign François Côté")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Camille Müller").length).toBeGreaterThan(0);
  });

  it("can include associated projects when a primary project filter is active", async () => {
    const user = userEvent.setup();
    projectFilterState.current = "507f1f77bcf86cd799439051";
    mockLeadsFetch();
    render(
      <LeadsPanel
        workspaceSlug="demo"
        canCreate
        canArchive
        canDelete
        canUpdate
      />,
    );

    const checkbox = await screen.findByLabelText("Include associated projects");
    await user.click(checkbox);

    await waitFor(() => {
      const listCall = vi
        .mocked(fetch)
        .mock.calls.find(([input]) => String(input).includes("/leads?") && String(input).includes("includeAssociated=true"));
      expect(listCall).toBeTruthy();
      expect(String(listCall?.[0])).toContain("projectId=507f1f77bcf86cd799439051");
    });
  });

  it("still supports archived restore from the opened row", async () => {
    const user = userEvent.setup();
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

    expect(await screen.findAllByText("Archived")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    await expandDesktopRow(user);
    expect(screen.getAllByRole("button", { name: "Restore" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Change status for François Côté")).not.toBeInTheDocument();
  });
});
