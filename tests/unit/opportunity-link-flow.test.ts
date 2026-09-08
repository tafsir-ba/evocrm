import { describe, expect, it } from "vitest";

import {
  buildOpportunityPeerEmptyMessage,
  buildSameProjectHint,
  createOpportunityHref,
  createPeerEscapeHref,
  isSafeOpportunityReturnTo,
  mapLeadApiRecord,
  mapPropertyApiRecord,
  resolveOpportunityReturnTo,
  validateOpportunitySameProject,
} from "@/lib/opportunity-link-flow";

describe("opportunity link flow helpers", () => {
  it("builds contextual create href with lead or property lock", () => {
    expect(createOpportunityHref("demo", { leadId: "lead-1", lockLead: true })).toBe(
      "/w/demo/opportunities/new?leadId=lead-1&lockLead=1",
    );
    expect(
      createOpportunityHref("demo", { propertyId: "prop-1", lockProperty: true }),
    ).toBe("/w/demo/opportunities/new?propertyId=prop-1&lockProperty=1");
  });

  it("maps API records with project metadata for combobox options", () => {
    expect(
      mapLeadApiRecord({
        id: "lead-1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        project: { id: "proj-1", name: "Riviera" },
      }),
    ).toEqual({
      id: "lead-1",
      label: "Ada Lovelace",
      meta: "ada@example.com · Riviera",
      projectId: "proj-1",
      projectName: "Riviera",
    });

    expect(
      mapPropertyApiRecord({
        id: "prop-1",
        title: "Sea View",
        reference: "SV-1",
        currency: "CHF",
        project: { id: "proj-1", name: "Riviera" },
      }),
    ).toEqual({
      id: "prop-1",
      label: "Sea View",
      meta: "SV-1 · Riviera",
      projectId: "proj-1",
      projectName: "Riviera",
      currency: "CHF",
    });
  });

  it("explains empty peer lists in the selected project", () => {
    expect(
      buildOpportunityPeerEmptyMessage({
        side: "property",
        projectName: "Riviera",
        total: 0,
      }),
    ).toContain("No properties in “Riviera”");
  });

  it("shows project name and peer count in the scoped hint", () => {
    expect(
      buildSameProjectHint({
        lockedSide: "lead",
        projectName: "Riviera",
        peerTotal: 2,
      }),
    ).toBe('Project “Riviera” · 2 properties');
  });

  it("builds escape links that preserve return context for the locked peer", () => {
    const href = createPeerEscapeHref({
      workspaceSlug: "demo",
      side: "property",
      projectId: "proj-1",
      lockedLeadId: "lead-1",
    });
    const url = new URL(href, "http://local.invalid");
    expect(url.pathname).toBe("/w/demo/properties/new");
    expect(url.searchParams.get("projectId")).toBe("proj-1");
    expect(url.searchParams.get("returnTo")).toBe(
      "/w/demo/opportunities/new?leadId=lead-1&lockLead=1",
    );
  });

  it("returns to New Opportunity with locked peer plus newly created entity", () => {
    const escapeHref = createPeerEscapeHref({
      workspaceSlug: "demo",
      side: "property",
      projectId: "proj-1",
      lockedLeadId: "lead-1",
    });
    const returnTo = new URL(escapeHref, "http://local.invalid").searchParams.get(
      "returnTo",
    );
    expect(returnTo).toBeTruthy();
    expect(isSafeOpportunityReturnTo(returnTo!, "demo")).toBe(true);
    expect(isSafeOpportunityReturnTo("https://evil.example/phish", "demo")).toBe(
      false,
    );
    expect(isSafeOpportunityReturnTo("/w/other/opportunities/new", "demo")).toBe(
      false,
    );

    expect(
      resolveOpportunityReturnTo(returnTo!, "demo", { propertyId: "prop-new" }),
    ).toBe(
      "/w/demo/opportunities/new?leadId=lead-1&lockLead=1&propertyId=prop-new",
    );

    const fromLeadEscape = createPeerEscapeHref({
      workspaceSlug: "demo",
      side: "lead",
      projectId: "proj-1",
      lockedPropertyId: "prop-1",
    });
    const leadReturnTo = new URL(fromLeadEscape, "http://local.invalid").searchParams.get(
      "returnTo",
    )!;
    expect(resolveOpportunityReturnTo(leadReturnTo, "demo", { leadId: "lead-new" })).toBe(
      "/w/demo/opportunities/new?propertyId=prop-1&lockProperty=1&leadId=lead-new",
    );
  });

  it("validates same-project pairing before submit", () => {
    expect(validateOpportunitySameProject("proj-1", "proj-2")).toContain("same project");
    expect(validateOpportunitySameProject("proj-1", "proj-1")).toBeNull();
    expect(validateOpportunitySameProject(null, "proj-1")).toContain("belong to a project");
  });
});
