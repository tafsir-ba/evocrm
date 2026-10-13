import { describe, expect, it, vi } from "vitest";

import {
  loadLeadWhatsAppDraft,
  WHATSAPP_VIEWING_LINE,
} from "@/lib/lead-whatsapp-welcome";

const GV = "6a0000000000000000000001";
const SWISS = "6a0000000000000000000002";

const projects: Record<string, Record<string, unknown>> = {
  [GV]: {
    id: GV,
    name: "Grosvenor Vistas",
    location: { countryCode: "JM", countryName: "Jamaica" },
    whatsappTemplate:
      "Hi {{firstName}},\n\nWelcome to {{projectName}}.\nFloor plans: https://example.com/gv-plans.pdf",
  },
  [SWISS]: {
    id: SWISS,
    name: "Satigny Duplex",
    location: { countryCode: "CH", countryName: "Switzerland" },
    whatsappTemplate: "Bonjour {{fullName}}, merci pour votre intérêt.",
  },
  plain: {
    id: "plain",
    name: "Harbour Point",
    location: { countryCode: null },
    country: null,
    whatsappTemplate: null,
  },
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/\/projects\/([^/?]+)$/);
    if (match) {
      const project = projects[match[1]!];
      return new Response(JSON.stringify({ data: { project } }), {
        status: project ? 200 : 404,
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const lead = {
  workspaceSlug: "acme",
  leadId: "lead-1",
  fullName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
};

describe("loadLeadWhatsAppDraft with project templates", () => {
  it("uses each project's exact text and country without leaking between projects", async () => {
    const fetchImpl = mockFetch();
    const gv = await loadLeadWhatsAppDraft({
      ...lead,
      projectId: GV,
      fetchImpl,
    });
    const swiss = await loadLeadWhatsAppDraft({
      ...lead,
      projectId: SWISS,
      fetchImpl,
    });

    expect(gv).toMatchObject({
      projectId: GV,
      source: "project_template",
      message:
        "Hi Ada,\n\nWelcome to Grosvenor Vistas.\nFloor plans: https://example.com/gv-plans.pdf",
      project: { countryCode: "JM" },
      errors: [],
    });
    expect(swiss).toMatchObject({
      projectId: SWISS,
      source: "project_template",
      message: "Bonjour Ada Lovelace, merci pour votre intérêt.",
      project: { countryCode: "CH" },
    });
    expect(gv.message).not.toContain("Bonjour");
    expect(swiss.message).not.toContain("Grosvenor");
    expect(gv.message).not.toContain(WHATSAPP_VIEWING_LINE);
  });

  it("does not load properties or documents when a custom template exists", async () => {
    const fetchImpl = mockFetch();
    await loadLeadWhatsAppDraft({ ...lead, projectId: GV, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the generated welcome when the project has no template", async () => {
    const fetchImpl = mockFetch();
    const draft = await loadLeadWhatsAppDraft({
      ...lead,
      projectId: "plain",
      fetchImpl,
    });
    expect(draft.source).toBe("generated");
    expect(draft.message).toContain(
      "Thank you for your interest in Harbour Point.",
    );
    expect(draft.message?.endsWith(WHATSAPP_VIEWING_LINE)).toBe(true);
    expect(draft.project?.countryCode).toBeNull();
  });

  it("reports unresolved placeholders instead of producing a draft", async () => {
    const fetchImpl = mockFetch();
    projects.lastName = {
      id: "lastName",
      name: "Formal",
      location: { countryCode: "CH" },
      whatsappTemplate: "Dear {{lastName}}",
    };
    const draft = await loadLeadWhatsAppDraft({
      ...lead,
      lastName: "",
      projectId: "lastName",
      fetchImpl,
    });
    expect(draft.message).toBeNull();
    expect(draft.errors[0]).toContain("{{lastName}}");
  });
});
