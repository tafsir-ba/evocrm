import { describe, expect, it } from "vitest";

import {
  GV_PILOT_ABORT_THRESHOLD,
  GV_PILOT_BATCH_SIZE,
  GV_PILOT_GENERAL_PROJECT_ID,
  GV_PILOT_PROJECT_ID,
  GV_PILOT_PROJECT_REFERENCE,
  GV_PILOT_SIDE_EFFECT_GUARD,
  assertDestinationIsGv,
  assertManifestHasNoPii,
  assertSideEffectGuard,
  buildLiveWriteGate,
  canPersistWrites,
  checksumContactIds,
  evaluateGvPilotEligibility,
  existingLeadFromRecord,
  hubspotContactIdempotencyKey,
  parseExecuteArgs,
  parseGvPilotManifest,
  selectPilotBatchIds,
  shouldAbortRun,
  snapshotFromHubSpotProperties,
  type GvPilotContactSnapshot,
  type GvPilotExistingLead,
} from "@/lib/hubspot-gv-pilot";

function contact(overrides: Partial<GvPilotContactSnapshot> = {}): GvPilotContactSnapshot {
  return {
    hubspotContactId: "1001",
    projectValues: ["grosvenorvistas"],
    notesValues: ["grosvenorvistas"],
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

describe("hubspot GV pilot eligibility", () => {
  it("accepts single-project GV with empty or exact notes, name, and email-or-phone", () => {
    expect(evaluateGvPilotEligibility(contact({ notesValues: [] }), []).writeEligible).toBe(true);
    expect(evaluateGvPilotEligibility(contact(), []).cohort).toBe("new_write_eligible");
    expect(
      evaluateGvPilotEligibility(contact({ emailNormalized: null, hasPhone: true }), []).writeEligible,
    ).toBe(true);
  });

  it("keeps email matches read-only", () => {
    const existing: GvPilotExistingLead[] = [
      { emailNormalized: "ada@example.com", nameKey: "ada|lovelace", hubspotContactIds: [] },
    ];
    const result = evaluateGvPilotEligibility(contact(), existing);
    expect(result).toEqual({
      writeEligible: false,
      cohort: "email_match_readonly",
      exclusions: ["email_match"],
    });
  });

  it("excludes identity conflicts, hubspot-id matches, multi-project, broker-only, and missing names", () => {
    expect(
      evaluateGvPilotEligibility(contact(), [
        { emailNormalized: "ada@example.com", nameKey: "other|person", hubspotContactIds: [] },
      ]).exclusions,
    ).toContain("identity_conflict");

    expect(
      evaluateGvPilotEligibility(contact(), [
        { emailNormalized: null, nameKey: "", hubspotContactIds: ["1001"] },
      ]).exclusions,
    ).toContain("hubspot_id_match");

    expect(
      evaluateGvPilotEligibility(contact({ projectValues: ["grosvenorvistas", "k2"] }), []).exclusions,
    ).toContain("multi_project");

    expect(
      evaluateGvPilotEligibility(
        contact({
          projectValues: [],
          notesValues: [],
          brokerPrefixes: ["grosvenorvistas"],
        }),
        [],
      ).exclusions,
    ).toContain("broker_only");

    expect(
      evaluateGvPilotEligibility(contact({ firstName: "", nameKey: "|lovelace" }), []).exclusions,
    ).toContain("missing_name");
  });

  it("treats notes with extra values as a conflict and leaves CMP / non-GV excluded", () => {
    expect(
      evaluateGvPilotEligibility(
        contact({ notesValues: ["grosvenorvistas", "k2"] }),
        [],
      ).exclusions,
    ).toContain("notes_conflict");
    expect(
      evaluateGvPilotEligibility(contact({ notesValues: ["k2"] }), []).exclusions,
    ).toContain("notes_conflict");
    expect(
      evaluateGvPilotEligibility(contact({ productValues: ["CMP"] }), []).exclusions,
    ).toContain("cmp_product");
    expect(
      evaluateGvPilotEligibility(contact({ projectValues: ["k2"], notesValues: [] }), []).exclusions,
    ).toContain("not_gv_project");
  });
});

describe("hubspot GV pilot guards and manifest", () => {
  it("builds HubSpot-id idempotency keys and snapshots without name fallbacks", () => {
    expect(hubspotContactIdempotencyKey("99")).toBe("hubspot:contact:99");
    const snapshot = snapshotFromHubSpotProperties("99", {
      firstname: "",
      lastname: "",
      email: "  Case@Example.com ",
      wd_project: "grosvenorvistas",
      hs_content_membership_notes: "",
    });
    expect(snapshot.firstName).toBe("");
    expect(snapshot.emailNormalized).toBe("case@example.com");
    expect(snapshot.hasPhone).toBe(false);
    expect(
      existingLeadFromRecord({
        emailNormalized: "case@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        attributes: { integration: { idempotencyKey: "hubspot:contact:99", externalId: "99" } },
      }).hubspotContactIds,
    ).toEqual(["99"]);
  });

  it("defaults to dry-run and requires execute + named manifest + confirm-write", () => {
    expect(parseExecuteArgs([])).toEqual({
      execute: false,
      manifestName: null,
      confirmWrite: false,
    });
    expect(parseExecuteArgs(["--manifest=gv-pilot-batch-01", "--execute"])).toEqual({
      execute: true,
      manifestName: "gv-pilot-batch-01",
      confirmWrite: false,
    });
    expect(canPersistWrites(parseExecuteArgs([]))).toEqual({
      ok: false,
      reason: "default_dry_run",
    });
    expect(
      canPersistWrites(parseExecuteArgs(["--execute", "--manifest=gv-pilot-batch-01"])),
    ).toEqual({ ok: false, reason: "execute_requires_confirm_write" });
    expect(
      canPersistWrites(
        parseExecuteArgs(["--execute", "--confirm-write", "--manifest=gv-pilot-batch-01"]),
      ),
    ).toEqual({ ok: true, manifestName: "gv-pilot-batch-01" });
  });

  it("selects the lowest 25 numeric HubSpot ids and checksums them", () => {
    const ids = Array.from({ length: 30 }, (_, index) => String(100 + (30 - index)));
    const selected = selectPilotBatchIds(ids);
    expect(selected).toHaveLength(GV_PILOT_BATCH_SIZE);
    expect(selected[0]).toBe("101");
    expect(selected[24]).toBe("125");
    expect(checksumContactIds(selected)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("asserts GV destination, side-effect guard, and abort threshold 1", () => {
    expect(() =>
      assertDestinationIsGv({
        projectId: GV_PILOT_PROJECT_ID,
        projectReference: GV_PILOT_PROJECT_REFERENCE,
      }),
    ).not.toThrow();
    expect(() =>
      assertDestinationIsGv({
        projectId: GV_PILOT_GENERAL_PROJECT_ID,
        projectReference: "EVO-GENERAL",
      }),
    ).toThrow(/destination_not_gv/);
    expect(() => assertSideEffectGuard()).not.toThrow();
    expect(() =>
      assertSideEffectGuard({ ...GV_PILOT_SIDE_EFFECT_GUARD, triggerAutomation: true }),
    ).toThrow(/automation_must_be_suppressed/);
    expect(GV_PILOT_ABORT_THRESHOLD).toBe(1);
    expect(shouldAbortRun(1)).toBe(true);
    expect(shouldAbortRun(0)).toBe(false);
  });

  it("rejects manifests that include PII keys or fail the destination/checksum contract", () => {
    const ids = Array.from({ length: 25 }, (_, index) => String(index + 1));
    const valid = {
      name: "gv-pilot-batch-01",
      version: 1,
      portalId: "5699191",
      workspaceId: "6a2f0444438006b304af77ec",
      destinationProjectId: GV_PILOT_PROJECT_ID,
      destinationReference: "GV",
      slug: "grosvenorvistas",
      size: 25,
      selection: {
        pool: "new_write_eligible",
        sort: "hubspot_contact_id_asc",
        exclude: ["email_match", "identity_conflict", "multi_project"],
      },
      hubspotContactIds: ids,
      idChecksum: checksumContactIds(ids),
    };
    expect(parseGvPilotManifest(valid).hubspotContactIds).toHaveLength(25);
    expect(() => assertManifestHasNoPii({ ...valid, email: "hidden@example.com" })).toThrow(
      /manifest_contains_pii_keys/,
    );
    expect(() => parseGvPilotManifest({ ...valid, idChecksum: "nope" })).toThrow(
      /manifest_checksum_mismatch/,
    );
    expect(() =>
      parseGvPilotManifest({ ...valid, destinationProjectId: GV_PILOT_GENERAL_PROJECT_ID }),
    ).toThrow(/manifest_destination_mismatch/);
  });

  it("opens the live-write gate only for a clean 25-record dry-run", () => {
    const ready = buildLiveWriteGate({
      persisted: false,
      mode: "dry-run",
      manifestValid: true,
      size: 25,
      wouldCreate: 25,
      unexpected: 0,
      emailMatchReadonly: 0,
      excluded: 0,
      destinationIsGv: true,
      mappingCount: 0,
      integrationDefaultProjectId: GV_PILOT_PROJECT_ID,
      integrationAllowOverride: false,
      enrollmentCount: 0,
      generalProjectTouched: false,
    });
    expect(ready).toEqual({ ready: true, blockers: [] });
    expect(
      buildLiveWriteGate({
        ...{
          persisted: true,
          mode: "execute",
          manifestValid: true,
          size: 25,
          wouldCreate: 24,
          unexpected: 1,
          emailMatchReadonly: 1,
          excluded: 0,
          destinationIsGv: true,
          mappingCount: 1,
          integrationDefaultProjectId: GV_PILOT_PROJECT_ID,
          integrationAllowOverride: false,
          enrollmentCount: 0,
          generalProjectTouched: false,
        },
      }).blockers,
    ).toEqual(
      expect.arrayContaining([
        "would_create_mismatch",
        "unexpected_results",
        "email_match_in_batch",
        "mapping_rows_present",
        "run_persisted_during_prepare",
        "mode_not_dry_run",
      ]),
    );
  });
});
