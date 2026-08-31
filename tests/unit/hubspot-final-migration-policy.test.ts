import { describe, expect, it } from "vitest";

import {
  assertGeneralFallbackAllowed,
  decideFinalMigrationOutcome,
  planOrderedMemberships,
  resolveOrderedAttributionSlugs,
  type MappedProject,
} from "@/lib/hubspot-final-migration-policy";
import type { GvPilotContactSnapshot } from "@/lib/hubspot-gv-pilot";
import { WD_MIGRATION_GENERAL_PROJECT_ID } from "@/lib/hubspot-wd-project-migration";

function snap(
  partial: Partial<GvPilotContactSnapshot> & { hubspotContactId: string },
): GvPilotContactSnapshot {
  return {
    emailNormalized: null,
    hasPhone: false,
    firstName: "Ada",
    lastName: "Lovelace",
    nameKey: "ada|lovelace",
    projectValues: [],
    notesValues: [],
    brokerPrefixes: [],
    productValues: [],
    ...partial,
  };
}

const mapped = new Map<string, MappedProject>([
  {
    slug: "cressy",
    projectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    reference: "cressy",
  },
  {
    slug: "CMP",
    projectId: "6a9489ee84c29475f4dbc6c3",
    reference: "CMP",
  },
  {
    slug: "delejette",
    projectId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    reference: "delejette",
  },
].map((m) => [m.slug, m]));

const fallback = new Set(["evohome", "swissrocestimation"]);

describe("hubspot-final-migration-policy", () => {
  it("plans ordered memberships with first-joined primary", () => {
    const plan = planOrderedMemberships({
      orderedSlugs: ["delejette", "cressy"],
      mappedBySlug: mapped,
      assignPrimary: true,
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]?.isPrimary).toBe(true);
    expect(plan[0]?.slug).toBe("delejette");
    expect(plan[1]?.isPrimary).toBe(false);
  });

  it("resolves multi wd_project without routing to General", () => {
    const snapshot = snap({
      hubspotContactId: "1",
      emailNormalized: "a@example.com",
      projectValues: ["cressy", "delejette"],
    });
    const decision = decideFinalMigrationOutcome({
      snapshot,
      existing: [],
      mappedBySlug: mapped,
      fallbackGeneralSlugs: fallback,
    });
    expect(decision.action).toBe("ensure_memberships");
    if (decision.action === "ensure_memberships") {
      expect(decision.memberships).toHaveLength(2);
      expect(decision.preserveExistingPrimary).toBe(true);
      expect(decision.reason.startsWith("multi_project:")).toBe(true);
    }
  });

  it("uses notes-mapped when wd blank", () => {
    const snapshot = snap({
      hubspotContactId: "2",
      emailNormalized: "b@example.com",
      notesValues: ["cressy"],
    });
    const attr = resolveOrderedAttributionSlugs({
      snapshot,
      mappedBySlug: mapped,
      evidence: {
        wdProjectSlugs: [],
        notesSlugs: ["cressy"],
        brokerSlugs: [],
        productValues: [],
        triedRules: [],
        mappedSlugs: ["cressy"],
        unmappedSlugs: [],
        fallbackGeneralSlugs: [],
        forbiddenSlugs: [],
      },
    });
    expect(attr.slugs).toEqual(["cressy"]);
    expect(attr.rule).toBe("notes_mapped_single");
  });

  it("routes fallback_general to General only with no mapped project", () => {
    const snapshot = snap({
      hubspotContactId: "3",
      emailNormalized: "c@example.com",
      projectValues: ["evohome"],
    });
    const decision = decideFinalMigrationOutcome({
      snapshot,
      existing: [],
      mappedBySlug: mapped,
      fallbackGeneralSlugs: fallback,
    });
    expect(decision.action).toBe("legacy_general");
    if (decision.action === "legacy_general") {
      expect(decision.reason).toBe("fallback_general:evohome");
      expect(decision.generalProjectId).toBe(WD_MIGRATION_GENERAL_PROJECT_ID);
    }
  });

  it("blocks General when mapped project evidence exists", () => {
    expect(() =>
      assertGeneralFallbackAllowed({
        evidence: {
          wdProjectSlugs: ["cressy"],
          notesSlugs: [],
          brokerSlugs: [],
          productValues: [],
          triedRules: [],
          mappedSlugs: ["cressy"],
          unmappedSlugs: [],
          fallbackGeneralSlugs: [],
          forbiddenSlugs: [],
        },
        reason: "no_project_signal:exhaustive_no_destination",
      }),
    ).toThrow(/general_fallback_forbidden/);
  });

  it("creates legacy General for exhaustive no-project", () => {
    const snapshot = snap({
      hubspotContactId: "4",
      emailNormalized: "d@example.com",
    });
    const decision = decideFinalMigrationOutcome({
      snapshot,
      existing: [],
      mappedBySlug: mapped,
      fallbackGeneralSlugs: fallback,
    });
    expect(decision.action).toBe("legacy_general");
    if (decision.action === "legacy_general") {
      expect(decision.reason).toBe("no_project_signal:exhaustive_no_destination");
    }
  });

  it("omits email on identity conflict membership create", () => {
    const snapshot = snap({
      hubspotContactId: "5",
      emailNormalized: "e@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      nameKey: "ada|lovelace",
      projectValues: ["cressy"],
    });
    const decision = decideFinalMigrationOutcome({
      snapshot,
      existing: [
        {
          emailNormalized: "e@example.com",
          nameKey: "other|person",
          hubspotContactIds: [],
        },
      ],
      mappedBySlug: mapped,
      fallbackGeneralSlugs: fallback,
    });
    expect(decision.action).toBe("ensure_memberships");
    if (decision.action === "ensure_memberships") {
      expect(decision.omitEmailForIdentityConflict).toBe(true);
    }
  });

  it("allows missing email+phone when destination exists", () => {
    const snapshot = snap({
      hubspotContactId: "6",
      emailNormalized: null,
      hasPhone: false,
      projectValues: ["cressy"],
    });
    const decision = decideFinalMigrationOutcome({
      snapshot,
      existing: [],
      mappedBySlug: mapped,
      fallbackGeneralSlugs: fallback,
    });
    expect(decision.action).toBe("ensure_memberships");
    if (decision.action === "ensure_memberships") {
      expect(decision.allowMissingContact).toBe(true);
    }
  });
});
