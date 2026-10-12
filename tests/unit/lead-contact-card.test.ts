import { describe, expect, it } from "vitest";

import {
  buildLeadContactCard,
  leadContactNameFields,
  projectClientLabel,
} from "@/lib/lead-contact-card";

function nameLine(vcard: string, prefix: string): string {
  const line = vcard.split("\r\n").find((entry) => entry.startsWith(prefix));
  return line ?? "";
}

describe("lead contact card", () => {
  it("maps project client to the given name and the lead name to the family name", () => {
    expect(projectClientLabel("Harbour Point")).toBe("Harbour Point Client");
    expect(projectClientLabel("Grosvenor Vistas")).toBe(
      "Grosvenor Vistas Client",
    );
    expect(
      leadContactNameFields({
        fullName: "Thelma Phillips",
        projectName: "Grosvenor Vistas",
      }),
    ).toEqual({
      given: "Grosvenor Vistas Client",
      family: "Thelma Phillips",
      formatted: "Grosvenor Vistas Client Thelma Phillips",
    });
    expect(
      leadContactNameFields({
        fullName: "Ada Lovelace",
        projectName: "North Dock",
      }).given,
    ).toBe("North Dock Client");
    expect(
      leadContactNameFields({
        fullName: "Ada Lovelace",
        projectName: "North Dock",
      }).formatted,
    ).not.toContain("Grosvenor");
  });

  it("writes a vCard 3.0 file with only the fields the CRM has", () => {
    const card = buildLeadContactCard({
      leadId: "lead-9",
      fullName: "Thelma Phillips",
      firstName: "Thelma",
      lastName: "Phillips",
      phone: "+41 79 000 00 00",
      email: "thelma@example.com",
      projectName: "Grosvenor Vistas",
      companyName: "Phillips SA",
      jobTitle: "Director",
      city: "Geneva",
      stateRegion: "Geneva",
      country: "Switzerland",
      notes: "Prefers afternoon calls.",
      profileUrl: "https://example.com/thelma",
      updatedAt: "2026-10-12T08:00:00.000Z",
    });

    expect(card?.fileName.endsWith(".vcf")).toBe(true);
    expect(card?.uid).toBe("urn:evocrm:lead:lead-9");
    expect(card?.givenName).toBe("Grosvenor Vistas Client");
    expect(card?.familyName).toBe("Thelma Phillips");
    expect(card?.vcard.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(nameLine(card?.vcard ?? "", "N:")).toBe(
      "N:Thelma Phillips;Grosvenor Vistas Client;;;",
    );
    expect(nameLine(card?.vcard ?? "", "FN:")).toBe(
      "FN:Grosvenor Vistas Client Thelma Phillips",
    );
    expect(card?.vcard).toContain("TEL;TYPE=CELL:+41790000000");
    expect(card?.vcard).toContain("EMAIL;TYPE=INTERNET:thelma@example.com");
    expect(card?.vcard).toContain("ORG:Phillips SA");
    expect(card?.vcard).toContain("TITLE:Director");
    expect(card?.vcard).toContain("ADR:;;;Geneva;Geneva;;Switzerland");
    expect(card?.vcard).toContain("URL:https://example.com/thelma");
    expect(card?.vcard).toContain("Prefers afternoon calls.");
    expect(card?.vcard).toContain("REV:20261012T080000Z");

    const again = buildLeadContactCard({
      leadId: "lead-9",
      fullName: "Thelma Phillips",
      phone: "+41790000000",
      projectName: "Grosvenor Vistas",
    });
    expect(again?.uid).toBe(card?.uid);
    expect(nameLine(again?.vcard ?? "", "N:")).toBe(
      "N:Thelma Phillips;Grosvenor Vistas Client;;;",
    );
  });

  it("leaves unknown fields out and does not invent a project label", () => {
    const card = buildLeadContactCard({
      leadId: "lead-9",
      fullName: "Ada Lovelace",
      phone: "+41 79 000 00 00",
    });

    expect(nameLine(card?.vcard ?? "", "N:")).toBe("N:Ada Lovelace;;;;");
    expect(card?.givenName).toBe("");
    expect(card?.vcard).not.toContain(" Client");
    expect(card?.vcard).not.toContain("ORG:");
    expect(card?.vcard).not.toContain("TITLE:");
    expect(card?.vcard).not.toContain("ADR:");
    expect(card?.vcard).not.toContain("EMAIL:");
    expect(card?.vcard).not.toContain("URL:");
    expect(card?.vcard).not.toContain("Grosvenor");
    expect(
      buildLeadContactCard({
        leadId: "lead-9",
        fullName: "Ada Lovelace",
        phone: "   ",
        projectName: "Harbour Point",
      }),
    ).toBeNull();
  });

  it("uses another project's name for the given name", () => {
    const card = buildLeadContactCard({
      leadId: "lead-2",
      fullName: "Ada Lovelace",
      phone: "+44 7700 900123",
      projectName: "Harbour Point",
      companyName: "",
      city: "",
      country: "United Kingdom",
    });

    expect(nameLine(card?.vcard ?? "", "N:")).toBe(
      "N:Ada Lovelace;Harbour Point Client;;;",
    );
    expect(card?.vcard).toContain("ADR:;;;;;;United Kingdom");
    expect(card?.vcard).not.toContain("ORG:");
    expect(card?.vcard).not.toContain("Grosvenor");
  });
});
