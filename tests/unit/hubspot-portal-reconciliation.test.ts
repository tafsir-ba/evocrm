import { describe, expect, it } from "vitest";

import { classifyPortalContact } from "@/lib/hubspot-wd-project-migration";
import type { GvPilotContactSnapshot, GvPilotExistingLead } from "@/lib/hubspot-gv-pilot";

function snap(partial: Partial<GvPilotContactSnapshot> & { hubspotContactId: string }): GvPilotContactSnapshot {
  return {
    projectValues: [],
    notesValues: [],
    brokerPrefixes: [],
    firstName: "Ada",
    lastName: "Lovelace",
    emailNormalized: "ada@example.com",
    hasPhone: true,
    nameKey: "ada|lovelace",
    productValues: [],
    ...partial,
  };
}

describe("classifyPortalContact", () => {
  const migratable = new Set(["portesdulac", "arbora", "CMP"]);
  const fallback = new Set(["evohome"]);

  it("marks hubspot id matches as migrated", () => {
    const existing: GvPilotExistingLead[] = [
      { emailNormalized: "ada@example.com", nameKey: "ada|lovelace", hubspotContactIds: ["99"] },
    ];
    expect(
      classifyPortalContact({
        snapshot: snap({ hubspotContactId: "99", projectValues: ["portesdulac"] }),
        existing,
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({ bucket: "migrated", reason: "hubspot_id_match", attributableSlug: null });
  });

  it("never guesses multi-project into a primary slug", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "1",
          projectValues: ["portesdulac", "arbora"],
          emailNormalized: null,
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "multi_or_identity_exception",
      reason: "multi_project",
      attributableSlug: null,
    });
  });

  it("keeps no-project-signal out of attributable migrate", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "2",
          projectValues: [],
          emailNormalized: null,
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }).bucket,
    ).toBe("no_project_signal");
  });

  it("attributes blank wd + product CMP to still_to_migrate CMP", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "2b",
          projectValues: [],
          productValues: ["CMP"],
          emailNormalized: "cmp-new@example.com",
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "still_to_migrate",
      reason: "product_field:CMP",
      attributableSlug: "CMP",
    });
  });

  it("does not route product vs wd conflict to General", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "2c",
          projectValues: ["portesdulac"],
          productValues: ["CMP"],
          emailNormalized: null,
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "multi_or_identity_exception",
      reason: "product_vs_wd_conflict",
      attributableSlug: null,
    });
  });

  it("routes clean single-project NEW to still_to_migrate", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "3",
          projectValues: ["portesdulac"],
          emailNormalized: "new@example.com",
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "still_to_migrate",
      reason: "new_write_eligible",
      attributableSlug: "portesdulac",
    });
  });

  it("routes email-bearing nameless single-project NEW to still_to_migrate", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "6",
          projectValues: ["portesdulac"],
          firstName: "",
          lastName: "",
          emailNormalized: "nameless@example.com",
          nameKey: "",
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "still_to_migrate",
      reason: "new_write_eligible",
      attributableSlug: "portesdulac",
    });
  });

  it("excludes fallback_general slugs from attributable migrate", () => {
    expect(
      classifyPortalContact({
        snapshot: snap({
          hubspotContactId: "4",
          projectValues: ["evohome"],
          emailNormalized: null,
        }),
        existing: [],
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }).bucket,
    ).toBe("excluded");
  });

  it("treats email matches without hubspot id as preexisting dedupe", () => {
    const existing: GvPilotExistingLead[] = [
      { emailNormalized: "ada@example.com", nameKey: "ada|lovelace", hubspotContactIds: [] },
    ];
    expect(
      classifyPortalContact({
        snapshot: snap({ hubspotContactId: "5", projectValues: ["portesdulac"] }),
        existing,
        fallbackGeneralSlugs: fallback,
        migratableSlugs: migratable,
      }),
    ).toEqual({
      bucket: "preexisting_deduped",
      reason: "email_match",
      attributableSlug: null,
    });
  });
});
