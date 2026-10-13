import { describe, expect, it } from "vitest";

import {
  activeProjectIdFromHref,
  chooseWhatsAppProject,
  projectPhoneCountry,
} from "@/lib/whatsapp-project-context";

const GV = "6a0000000000000000000001";
const SWISS = "6a0000000000000000000002";

describe("projectPhoneCountry", () => {
  it("uses the structured location country code first", () => {
    expect(
      projectPhoneCountry({
        id: GV,
        name: "Grosvenor Vistas",
        country: "Switzerland",
        location: { countryCode: "JM", countryName: "Jamaica" },
      }),
    ).toBe("JM");
  });

  it("falls back to a recognized legacy country name only when unambiguous", () => {
    expect(
      projectPhoneCountry({ id: SWISS, name: "Satigny", country: "Suisse" }),
    ).toBe("CH");
    expect(
      projectPhoneCountry({
        id: GV,
        name: "GV",
        country: null,
        location: { countryCode: null, countryName: "Jamaica" },
      }),
    ).toBe("JM");
    expect(
      projectPhoneCountry({
        id: GV,
        name: "Mixed",
        country: "Switzerland",
        location: { countryCode: null, countryName: "Jamaica" },
      }),
    ).toBeNull();
    expect(
      projectPhoneCountry({ id: GV, name: "Unknown", country: "Atlantis" }),
    ).toBeNull();
  });

  it("never assumes Switzerland when the stored location is missing", () => {
    expect(
      projectPhoneCountry({ id: GV, name: "No location", location: null }),
    ).toBeNull();
    expect(
      projectPhoneCountry({
        id: GV,
        name: "Empty",
        location: { countryCode: null },
      }),
    ).toBeNull();
    expect(projectPhoneCountry(null)).toBeNull();
  });
});

describe("chooseWhatsAppProject", () => {
  const lead = {
    project: { id: GV },
    projectMemberships: [
      { projectId: GV, isPrimary: true },
      { projectId: SWISS, isPrimary: false },
    ],
  };

  it("prefers the active project when the lead belongs to it", () => {
    expect(chooseWhatsAppProject(lead, SWISS)).toEqual({
      status: "resolved",
      projectId: SWISS,
      basis: "active",
    });
  });

  it("uses the primary project when the active project is not one of the lead's", () => {
    expect(chooseWhatsAppProject(lead, "6a00000000000000000000ff")).toEqual({
      status: "resolved",
      projectId: GV,
      basis: "primary",
    });
    expect(chooseWhatsAppProject(lead, null)).toMatchObject({ projectId: GV });
  });

  it("requires a choice for several projects without a primary", () => {
    expect(
      chooseWhatsAppProject(
        {
          project: null,
          projectMemberships: [
            { projectId: GV, isPrimary: false },
            { projectId: SWISS, isPrimary: false },
          ],
        },
        null,
      ),
    ).toEqual({ status: "ambiguous", projectIds: [GV, SWISS] });
    expect(chooseWhatsAppProject({ project: null }, null)).toEqual({
      status: "none",
    });
    expect(
      chooseWhatsAppProject(
        { project: null, secondaryProjects: [{ id: SWISS }] },
        null,
      ),
    ).toMatchObject({
      status: "resolved",
      projectId: SWISS,
      basis: "only_project",
    });
  });
});

describe("activeProjectIdFromHref", () => {
  it("reads project-scoped list return paths", () => {
    expect(activeProjectIdFromHref(`/w/acme/projects/${GV}/leads?page=2`)).toBe(
      GV,
    );
    expect(activeProjectIdFromHref(`/w/acme/leads?projectId=${SWISS}`)).toBe(
      SWISS,
    );
    expect(activeProjectIdFromHref("/w/acme/leads")).toBeNull();
    expect(activeProjectIdFromHref(null)).toBeNull();
  });
});
