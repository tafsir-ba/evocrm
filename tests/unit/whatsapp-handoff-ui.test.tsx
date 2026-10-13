import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeadContactActions } from "@/components/leads/lead-contact-actions";
import { LeadsTable, type LeadTableItem } from "@/components/leads/leads-table";

const GV = "6a0000000000000000000001";
const SWISS = "6a0000000000000000000002";

const projects: Record<string, Record<string, unknown>> = {
  [GV]: {
    id: GV,
    name: "Grosvenor Vistas",
    location: { countryCode: "JM", countryName: "Jamaica" },
    whatsappTemplate: "Hi {{firstName}}, welcome to {{projectName}}.",
  },
  [SWISS]: {
    id: SWISS,
    name: "Satigny Duplex",
    location: { countryCode: "CH", countryName: "Switzerland" },
    whatsappTemplate: null,
  },
  noGeo: {
    id: "noGeo",
    name: "Unmapped",
    location: { countryCode: null },
    whatsappTemplate: "Hello {{fullName}}",
  },
};

const fetchMock = vi.fn<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
>(async (input) => {
  const url = String(input);
  const match = url.match(/\/projects\/([^/?]+)$/);
  if (match) {
    return new Response(
      JSON.stringify({ data: { project: projects[match[1]!] } }),
      {
        status: 200,
      },
    );
  }
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lead(overrides: Partial<LeadTableItem> = {}): LeadTableItem {
  return {
    id: "lead-gv",
    fullName: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phone: "8763797607",
    createdAt: "2026-10-01T00:00:00.000Z",
    status: null,
    source: null,
    project: { id: GV, name: "Grosvenor Vistas", reference: null },
    tagsResolved: [],
    assignedUser: null,
    ...overrides,
  };
}

async function openDraftHref(): Promise<string | null> {
  const dialog = await screen.findByRole("dialog");
  const link = await within(dialog).findByRole("link", {
    name: "Open WhatsApp draft",
  });
  return link.getAttribute("href");
}

function renderDetail(
  item: LeadTableItem,
  activeProjectId: string | null = null,
) {
  render(
    <LeadContactActions
      phone={item.phone}
      whatsapp={{ workspaceSlug: "acme", lead: item, activeProjectId }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
}

function renderList(
  item: LeadTableItem,
  workspaceProjectId: string | null = null,
) {
  const noop = () => undefined;
  render(
    <LeadsTable
      workspaceSlug="acme"
      leads={[item]}
      statuses={[]}
      members={[]}
      canUpdate={false}
      canArchive={false}
      canDelete={false}
      canManageStatuses={false}
      canAddNotes={false}
      selectedLeadIds={new Set()}
      selectAllMatching={false}
      excludedLeadIds={new Set()}
      allPageSelected={false}
      somePageSelected={false}
      pendingLeadId={null}
      sort="age"
      sortDir="desc"
      onSort={noop}
      columnFilters={{
        search: "",
        phone: "",
        companyId: "",
        projectId: "",
        sourceId: "",
        statusId: "",
        assignedTo: "",
        agePreset: "",
        nextFilter: "",
        urgencyFilter: "",
        tagId: "",
      }}
      filterOptions={{
        statuses: [],
        sources: [],
        members: [],
        companies: [],
        projects: [],
        tags: [],
        workspaceProjectId,
      }}
      onColumnFilterChange={noop}
      onToggleLead={noop}
      onTogglePage={noop}
      onAssign={noop}
      onStatusChange={noop}
      onCreateStatus={async () => undefined}
      onAddNote={async () => undefined}
      onArchive={noop}
      onRestore={noop}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: `WhatsApp ${item.fullName}` }),
  );
}

describe("WhatsApp handoff in lead detail and lead list", () => {
  it("offers a Grosvenor Vistas local number as +1 876 with the project's own text", async () => {
    renderDetail(lead());
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("+1 876 379 7607"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Jamaica \(JM\)/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Inferred from the project Grosvenor Vistas/),
    ).toBeInTheDocument();
    expect(await openDraftHref()).toBe(
      `https://wa.me/18763797607?text=${encodeURIComponent("Hi Ada, welcome to Grosvenor Vistas.")}`,
    );
  });

  it("produces the same destination and text from the list row as from the detail", async () => {
    renderDetail(lead());
    const detailHref = await openDraftHref();
    cleanup();

    renderList(lead());
    expect(await openDraftHref()).toBe(detailHref);
  });

  it("drops the Swiss trunk zero and keeps a prefixed foreign number foreign", async () => {
    renderList(
      lead({
        id: "lead-ch",
        phone: "079 123 45 67",
        project: { id: SWISS, name: "Satigny Duplex", reference: null },
      }),
    );
    expect(
      (await openDraftHref())?.startsWith("https://wa.me/41791234567?text="),
    ).toBe(true);
    cleanup();

    renderDetail(lead({ id: "lead-uk", phone: "+44 20 7946 0958" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        /kept even though Grosvenor Vistas is in Jamaica/,
      ),
    ).toBeInTheDocument();
    expect(
      (await openDraftHref())?.startsWith("https://wa.me/442079460958?"),
    ).toBe(true);
  });

  it("uses the active project's country when the lead belongs to several projects", async () => {
    const multi = lead({
      phone: "079 123 45 67",
      projectMemberships: [
        {
          id: "m1",
          projectId: GV,
          isPrimary: true,
          sourceOrder: 0,
          project: { id: GV, name: "Grosvenor Vistas", reference: null },
        },
        {
          id: "m2",
          projectId: SWISS,
          isPrimary: false,
          sourceOrder: 1,
          project: { id: SWISS, name: "Satigny Duplex", reference: null },
        },
      ],
    });
    renderList(multi, SWISS);
    expect(
      (await openDraftHref())?.startsWith("https://wa.me/41791234567?"),
    ).toBe(true);
  });

  it("asks for a project when several projects have no primary, then for the country when it is unknown", async () => {
    renderDetail(
      lead({
        project: null,
        projectMemberships: [
          {
            id: "m1",
            projectId: GV,
            isPrimary: false,
            sourceOrder: 0,
            project: { id: GV, name: "Grosvenor Vistas", reference: null },
          },
          {
            id: "m2",
            projectId: "noGeo",
            isPrimary: false,
            sourceOrder: 1,
            project: { id: "noGeo", name: "Unmapped", reference: null },
          },
        ],
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Choose a project to interpret this number/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("link", { name: "Open WhatsApp draft" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Open WhatsApp draft" }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(
      within(dialog).getByLabelText("Project for country and message"),
      {
        target: { value: "noGeo" },
      },
    );
    expect(
      await within(dialog).findByText(/Unmapped has no recognized country/),
    ).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByLabelText("Country for a local number"),
      {
        target: { value: "JM" },
      },
    );
    expect(await openDraftHref()).toBe(
      `https://wa.me/18763797607?text=${encodeURIComponent("Hello Ada Lovelace")}`,
    );
  });

  it("keeps a visible action with a correction state for an unusable number", async () => {
    renderList(lead({ phone: "876 379 7607 ext 4" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByTestId("whatsapp-destination-issue"),
    ).toHaveTextContent(/extension/);
    expect(
      within(dialog).queryByRole("link", { name: "Open WhatsApp draft" }),
    ).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Number for this message"), {
      target: { value: "876 379 7607" },
    });
    expect(
      (await openDraftHref())?.startsWith("https://wa.me/18763797607?"),
    ).toBe(true);
  });

  it("blocks the handoff instead of using a generic text when the project cannot be read", async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: { message: "Forbidden" } }), {
          status: 403,
        }),
    );
    renderDetail(lead());
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        /do not have access to this project's WhatsApp settings/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/has no recognized country/)).toBeNull();
    expect(
      within(dialog).queryByRole("link", { name: "Open WhatsApp draft" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Open WhatsApp draft" }),
    ).toBeDisabled();
  });

  it("only opens a draft link and never sends anything", async () => {
    renderDetail(lead());
    await openDraftHref();
    const methods = fetchMock.mock.calls.map(
      ([, init]) => (init as RequestInit | undefined)?.method ?? "GET",
    );
    expect(methods.every((method) => method === "GET")).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("graph.facebook"),
      ),
    ).toBe(false);
  });
});
