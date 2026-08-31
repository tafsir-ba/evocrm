import { describe, expect, it } from "vitest";

import { checksumContactIds, resolveMigrationLeadNames } from "@/lib/hubspot-gv-pilot";
import {
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_GV_PROJECT_ID,
  assertExplicitMappedDestination,
  buildWdMigrationLiveWriteGate,
  evaluateWdProjectEligibility,
  parseWdProjectManifest,
  selectSortedContactIds,
} from "@/lib/hubspot-wd-project-migration";

const DEST_ID = "6a1111111111111111111111";
const DEST_REF = "LEPARCDESCRETS";

function contact(
  overrides: Partial<Parameters<typeof evaluateWdProjectEligibility>[0]> = {},
) {
  return {
    hubspotContactId: "2001",
    projectValues: ["leparcdescrets"],
    notesValues: ["leparcdescrets"],
    brokerPrefixes: [],
    firstName: "Ada",
    lastName: "Lovelace",
    emailNormalized: "ada@example.com",
    hasPhone: true,
    nameKey: "ada|lovelace",
    productValues: [],
    ...overrides,
  };
}

describe("wd_project migration eligibility", () => {
  it("accepts clean single-project contacts for the target slug", () => {
    expect(
      evaluateWdProjectEligibility(contact({ notesValues: [] }), [], "leparcdescrets").writeEligible,
    ).toBe(true);
    expect(evaluateWdProjectEligibility(contact(), [], "leparcdescrets").cohort).toBe(
      "new_write_eligible",
    );
  });

  it("does not treat Grosvenor-only contacts as eligible for another slug", () => {
    const result = evaluateWdProjectEligibility(
      contact({ projectValues: ["grosvenorvistas"], notesValues: ["grosvenorvistas"] }),
      [],
      "leparcdescrets",
    );
    expect(result.writeEligible).toBe(false);
    expect(result.exclusions).toContain("not_target_project");
  });

  it("excludes multi-project, broker-only, missing name, email match, and identity conflict", () => {
    expect(
      evaluateWdProjectEligibility(
        contact({ projectValues: ["leparcdescrets", "v77"] }),
        [],
        "leparcdescrets",
      ).exclusions,
    ).toContain("multi_project");
    expect(
      evaluateWdProjectEligibility(
        contact({
          projectValues: [],
          notesValues: [],
          brokerPrefixes: ["leparcdescrets"],
        }),
        [],
        "leparcdescrets",
      ).exclusions,
    ).toContain("broker_only");
    expect(
      evaluateWdProjectEligibility(
        contact({ firstName: "", emailNormalized: null, hasPhone: false }),
        [],
        "leparcdescrets",
      ).exclusions,
    ).toContain("missing_name");
    expect(
      evaluateWdProjectEligibility(
        contact({ firstName: "", lastName: "" }),
        [{ emailNormalized: "ada@example.com", nameKey: "ada|lovelace", hubspotContactIds: [] }],
        "leparcdescrets",
      ).cohort,
    ).toBe("email_match_readonly");
    expect(
      evaluateWdProjectEligibility(
        contact(),
        [{ emailNormalized: "ada@example.com", nameKey: "other|person", hubspotContactIds: [] }],
        "leparcdescrets",
      ).exclusions,
    ).toContain("identity_conflict");
  });

  it("reclassifies email-bearing nameless contacts as write-eligible", () => {
    const result = evaluateWdProjectEligibility(
      contact({ firstName: "", lastName: "", emailNormalized: "buyer@example.com" }),
      [],
      "leparcdescrets",
    );
    expect(result.writeEligible).toBe(true);
    expect(result.exclusions).not.toContain("missing_name");
  });

  it("attributes blank wd_project + product_intersted_in=CMP to CMP", () => {
    const result = evaluateWdProjectEligibility(
      contact({
        projectValues: [],
        notesValues: [],
        productValues: ["CMP"],
      }),
      [],
      "CMP",
    );
    expect(result.writeEligible).toBe(true);
    expect(result.exclusions).not.toContain("cmp_product");
  });

  it("keeps CMP product as an exclusion for non-CMP project waves", () => {
    expect(
      evaluateWdProjectEligibility(
        contact({ productValues: ["CMP"] }),
        [],
        "leparcdescrets",
      ).exclusions,
    ).toContain("cmp_product");
  });

  it("buckets product=CMP with conflicting explicit wd_project", () => {
    const result = evaluateWdProjectEligibility(
      contact({
        projectValues: ["portesdulac"],
        notesValues: [],
        productValues: ["CMP"],
      }),
      [],
      "CMP",
    );
    expect(result.writeEligible).toBe(false);
    expect(result.exclusions).toContain("product_vs_wd_conflict");
  });

  it("accepts sole wd_project=CMP with CMP product", () => {
    expect(
      evaluateWdProjectEligibility(
        contact({
          projectValues: ["CMP"],
          notesValues: [],
          productValues: ["CMP"],
        }),
        [],
        "CMP",
      ).writeEligible,
    ).toBe(true);
  });
});

describe("explicit mapped destination", () => {
  it("refuses Grosvenor fallback and EvoHome General", () => {
    expect(() =>
      assertExplicitMappedDestination({
        slug: "leparcdescrets",
        destinationProjectId: WD_MIGRATION_GV_PROJECT_ID,
        destinationReference: "GV",
        mapping: {
          hubspotProjectId: "leparcdescrets",
          status: "mapped",
          evoProjectId: WD_MIGRATION_GV_PROJECT_ID,
        },
      }),
    ).toThrow(/grosvenor_fallback_not_allowed/);
    expect(() =>
      assertExplicitMappedDestination({
        slug: "leparcdescrets",
        destinationProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
        destinationReference: "EVO-GENERAL",
        mapping: {
          hubspotProjectId: "leparcdescrets",
          status: "mapped",
          evoProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
        },
      }),
    ).toThrow(/evo_general_not_allowed/);
  });

  it("requires a mapped row pointing at the destination", () => {
    expect(() =>
      assertExplicitMappedDestination({
        slug: "leparcdescrets",
        destinationProjectId: DEST_ID,
        destinationReference: DEST_REF,
        mapping: null,
      }),
    ).toThrow(/explicit_mapping_required/);
    expect(() =>
      assertExplicitMappedDestination({
        slug: "leparcdescrets",
        destinationProjectId: DEST_ID,
        destinationReference: DEST_REF,
        mapping: { hubspotProjectId: "leparcdescrets", status: "unmapped", evoProjectId: DEST_ID },
      }),
    ).toThrow(/mapping_not_mapped/);
    expect(() =>
      assertExplicitMappedDestination({
        slug: "grosvenorvistas",
        destinationProjectId: DEST_ID,
        destinationReference: DEST_REF,
        mapping: { hubspotProjectId: "grosvenorvistas", status: "mapped", evoProjectId: DEST_ID },
      }),
    ).toThrow(/grosvenor_fallback_not_allowed/);
  });

  it("accepts an explicit mapped non-fallback destination", () => {
    expect(() =>
      assertExplicitMappedDestination({
        slug: "leparcdescrets",
        destinationProjectId: DEST_ID,
        destinationReference: DEST_REF,
        mapping: { hubspotProjectId: "leparcdescrets", status: "mapped", evoProjectId: DEST_ID },
      }),
    ).not.toThrow();
  });
});

describe("wd_project migration manifest", () => {
  it("parses a PII-free mapped-destination manifest and rejects GV dest", () => {
    const ids = selectSortedContactIds(["3", "1", "2"]);
    const raw = {
      name: "leparcdescrets-batch-01",
      version: 1,
      portalId: "5699191",
      workspaceId: "6a2f0444438006b304af77ec",
      destinationProjectId: DEST_ID,
      destinationReference: DEST_REF,
      slug: "leparcdescrets",
      sourceHubSpotProjectId: "leparcdescrets",
      size: 3,
      selection: {
        pool: "new_write_eligible",
        sort: "hubspot_contact_id_asc",
        exclude: ["email_match"],
      },
      hubspotContactIds: ids,
      idChecksum: checksumContactIds(ids),
    };
    expect(parseWdProjectManifest(raw).size).toBe(3);
    expect(() =>
      parseWdProjectManifest({
        ...raw,
        destinationProjectId: WD_MIGRATION_GV_PROJECT_ID,
        destinationReference: "GV",
      }),
    ).toThrow(/grosvenor_fallback_not_allowed/);
  });
});

describe("wd_project live write gate", () => {
  it("is ready only when destination is explicitly mapped and not a fallback", () => {
    const ready = buildWdMigrationLiveWriteGate({
      persisted: false,
      mode: "dry-run",
      manifestValid: true,
      size: 2,
      wouldCreate: 2,
      unexpected: 0,
      emailMatchReadonly: 0,
      excluded: 0,
      destinationIsMapped: true,
      destinationIsGv: false,
      destinationIsGeneral: false,
      mappingOk: true,
      integrationAllowOverride: false,
      enrollmentCount: 0,
      generalProjectTouched: false,
    });
    expect(ready.ready).toBe(true);
    expect(
      buildWdMigrationLiveWriteGate({
        persisted: false,
        mode: "dry-run",
        manifestValid: true,
        size: 2,
        wouldCreate: 2,
        unexpected: 0,
        emailMatchReadonly: 0,
        excluded: 0,
        destinationIsMapped: false,
        destinationIsGv: true,
        destinationIsGeneral: false,
        mappingOk: false,
        integrationAllowOverride: false,
        enrollmentCount: 0,
        generalProjectTouched: false,
      }).blockers,
    ).toEqual(
      expect.arrayContaining(["grosvenor_fallback_not_allowed", "mapping_required"]),
    );
  });
});
