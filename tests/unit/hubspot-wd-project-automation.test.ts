import { describe, expect, it } from "vitest";

import {
  WD_MIGRATION_FORBIDDEN_SLUG,
  buildExceptionBuckets,
  findUnresolvedAlias,
  isSystemicAutomationFailure,
  primaryExceptionReason,
  remainingRoadmapSlugs,
  stableProjectReference,
} from "@/lib/hubspot-wd-project-migration";

describe("wd_project automation helpers", () => {
  it("builds stable references and skips mapped or fallback slugs", () => {
    expect(stableProjectReference("portesdulac")).toBe("PORTESDULAC");
    expect(stableProjectReference("seymaz44-vpi")).toBe("SEYMAZ44-VPI");
    expect(
      remainingRoadmapSlugs(
        {
          create_then_map: ["leparcdescrets", "portesdulac", "evohome"],
          map_existing: ["grosvenorvistas"],
          no_contacts_skip: [],
          fallback_general: ["evohome"],
          rows: [],
        },
        new Set(["leparcdescrets"]),
      ),
    ).toEqual(["portesdulac"]);
    expect(
      remainingRoadmapSlugs(
        {
          create_then_map: [WD_MIGRATION_FORBIDDEN_SLUG, "arbora"],
          map_existing: [],
          no_contacts_skip: [],
          fallback_general: [],
          rows: [],
        },
        new Set(),
      ),
    ).toEqual(["arbora"]);
  });

  it("does not treat a same-reference project as an unresolved alias", () => {
    expect(
      findUnresolvedAlias({
        slug: "portesdulac",
        name: "Portes du Lac",
        reference: "PORTESDULAC",
        projects: [
          { id: "1", name: "Portes du Lac", reference: "PORTESDULAC" },
          { id: "2", name: "Grosvenor Vistas", reference: "GV" },
        ],
      }),
    ).toBeNull();
    expect(
      findUnresolvedAlias({
        slug: "portesdulac",
        name: "Portes du Lac",
        reference: "PORTESDULAC",
        projects: [{ id: "2", name: "Portes du Lac", reference: "PDL-OLD" }],
      })?.id,
    ).toBe("2");
  });

  it("assigns a single durable exception reason and never blocks clean NEW contacts", () => {
    expect(primaryExceptionReason(["not_target_project", "notes_only"])).toBe("notes_only");
    expect(primaryExceptionReason(["not_target_project"])).toBe("no_project_signal");
    const buckets = buildExceptionBuckets(
      [
        {
          hubspotContactId: "1",
          projectValues: ["portesdulac"],
          notesValues: ["portesdulac"],
          brokerPrefixes: [],
          firstName: "Ada",
          lastName: "Lovelace",
          emailNormalized: "ada@example.com",
          hasPhone: true,
          nameKey: "ada|lovelace",
          productValues: [],
        },
        {
          hubspotContactId: "2",
          projectValues: ["portesdulac", "v77"],
          notesValues: [],
          brokerPrefixes: [],
          firstName: "Ada",
          lastName: "Lovelace",
          emailNormalized: "multi@example.com",
          hasPhone: true,
          nameKey: "ada|lovelace",
          productValues: [],
        },
        {
          hubspotContactId: "3",
          projectValues: [],
          notesValues: ["portesdulac"],
          brokerPrefixes: [],
          firstName: "Ada",
          lastName: "Lovelace",
          emailNormalized: "notes@example.com",
          hasPhone: true,
          nameKey: "ada|lovelace",
          productValues: [],
        },
      ],
      [],
      "portesdulac",
    );
    expect(buckets.records.map((record) => record.hubspotContactId)).toEqual(["2", "3"]);
    expect(buckets.counts).toEqual({ multi_project: 1, notes_only: 1 });
  });

  it("classifies only destination/idempotency/enrollment/gate failures as systemic", () => {
    expect(isSystemicAutomationFailure("existing_alias_unresolved")).toBe(false);
    expect(isSystemicAutomationFailure("wrong_destination")).toBe(true);
    expect(isSystemicAutomationFailure("enrollment_breach")).toBe(true);
    expect(isSystemicAutomationFailure("runner_gate_failure:dry_run")).toBe(true);
  });
});
