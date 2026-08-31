import { describe, expect, it } from "vitest";

import {
  LEAD_EMAIL_UNIQUE_INDEX_SPEC,
  LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC,
  buildDuplicateArchiveAttributes,
  collectHubSpotSourceIds,
  evaluateLeadUniqueIndexWriteGate,
  mergeIntelligenceProvenance,
  mergeLeadAttributes,
  mergeLeadNotes,
  planEnrollmentRemap,
  planMembershipRemap,
  selectCanonicalLead,
  unionDuplicateIdGroups,
  type LeadDuplicateSnapshot,
} from "@/lib/lead-duplicate-reconciliation";

function lead(
  overrides: Partial<LeadDuplicateSnapshot> & Pick<LeadDuplicateSnapshot, "id" | "createdAt">,
): LeadDuplicateSnapshot {
  return {
    workspaceId: "ws-1",
    projectId: "proj-1",
    updatedAt: overrides.createdAt,
    archivedAt: null,
    emailNormalized: "ada@example.com",
    notes: null,
    phone: null,
    phoneNormalized: null,
    language: null,
    companyId: null,
    ownerId: null,
    assignedTo: null,
    sourceId: null,
    industry: null,
    jobTitle: null,
    stateRegion: null,
    tags: [],
    attributes: {
      integration: {
        inboundSource: "hubspot-wd-project",
        idempotencyKey: "hubspot:contact:99",
        externalId: "99",
        integrationId: "int-1",
      },
      campaignEnrollmentPolicy: {
        defaultExcluded: true,
        source: "hubspot_legacy_migration",
      },
    },
    intelligenceProvenance: {},
    associationScore: 1,
    ...overrides,
  };
}

describe("lead duplicate reconciliation", () => {
  it("keeps the older lead as canonical when association scores match", () => {
    const older = lead({
      id: "b",
      createdAt: new Date("2026-08-31T05:51:33.661Z"),
    });
    const newer = lead({
      id: "a",
      createdAt: new Date("2026-08-31T05:51:33.677Z"),
    });
    expect(selectCanonicalLead([newer, older])).toEqual({
      canonicalId: "b",
      duplicateIds: ["a"],
    });
  });

  it("prefers the lead with more associations", () => {
    const sparse = lead({
      id: "old",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      associationScore: 1,
    });
    const rich = lead({
      id: "new",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      associationScore: 4,
    });
    expect(selectCanonicalLead([sparse, rich]).canonicalId).toBe("new");
  });

  it("unions overlapping email and idempotency groups", () => {
    expect(unionDuplicateIdGroups([["a", "b"], ["b", "c"], ["d", "e"]])).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("merges HubSpot source ids, notes, provenance, and campaign guards onto the canonical", () => {
    const merged = mergeLeadAttributes({
      canonical: {
        integration: {
          inboundSource: "hubspot-wd-project",
          idempotencyKey: "hubspot:contact:99",
          externalId: "99",
        },
      },
      duplicate: {
        integration: {
          inboundSource: "hubspot-wd-project",
          idempotencyKey: "hubspot:contact:99",
          externalId: "99",
        },
        campaignEnrollmentPolicy: {
          defaultExcluded: true,
          source: "hubspot_legacy_migration",
        },
      },
      archivedLeadId: "dup-1",
    });
    const sources = collectHubSpotSourceIds(merged);
    expect(sources.contactIds).toEqual(["99"]);
    expect(sources.idempotencyKeys).toEqual(["hubspot:contact:99"]);
    expect(merged.integration).toMatchObject({
      mergedArchivedLeadIds: ["dup-1"],
    });
    expect(merged.campaignEnrollmentPolicy).toEqual({
      defaultExcluded: true,
      source: "hubspot_legacy_migration",
    });
    expect(mergeLeadNotes(null, "from dup")).toBe("from dup");
    expect(mergeLeadNotes("keep", "keep")).toBe("keep");
    expect(mergeLeadNotes("alpha", "beta")).toBe("alpha\n\n---\nbeta");
    expect(
      mergeIntelligenceProvenance(
        { industry: { method: "hubspot", source: "cmp", appliedAt: "a", notes: null } },
        {
          industry: { method: "import", source: "csv", appliedAt: "b", notes: null },
          jobTitle: { method: "hubspot", source: "cmp", appliedAt: "c", notes: null },
        },
      ),
    ).toEqual({
      industry: { method: "hubspot", source: "cmp", appliedAt: "a", notes: null },
      jobTitle: { method: "hubspot", source: "cmp", appliedAt: "c", notes: null },
    });
  });

  it("archives duplicate memberships on the same project and remaps extras", () => {
    expect(
      planMembershipRemap({
        canonicalLeadId: "can",
        duplicateLeadId: "dup",
        canonicalProjectIds: ["proj-1"],
        duplicateMemberships: [
          { id: "m1", projectId: "proj-1" },
          { id: "m2", projectId: "proj-2" },
        ],
      }),
    ).toEqual({
      archiveMembershipIds: ["m1"],
      remapMembershipIds: ["m2"],
    });
  });

  it("does not create enrollments; remaps existing or pauses conflicts", () => {
    expect(
      planEnrollmentRemap({
        canonicalCampaignIds: ["camp-1"],
        duplicateEnrollments: [
          { id: "e1", campaignId: "camp-1", status: "active" },
          { id: "e2", campaignId: "camp-2", status: "active" },
        ],
      }),
    ).toEqual({
      remapEnrollmentIds: ["e2"],
      pauseEnrollmentIds: ["e1"],
    });
  });

  it("keeps the unique-index write gate closed until duplicates are gone and indexes exist", () => {
    expect(
      evaluateLeadUniqueIndexWriteGate({
        emailDupGroups: 90,
        keyDupGroups: 90,
        emailUniqueIndexPresent: false,
        idempotencyUniqueIndexPresent: false,
      }),
    ).toEqual({
      ready: false,
      blockers: [
        "active_email_duplicate_groups",
        "active_idempotency_duplicate_groups",
        "email_unique_index_missing",
        "idempotency_unique_index_missing",
      ],
    });
    expect(
      evaluateLeadUniqueIndexWriteGate({
        emailDupGroups: 0,
        keyDupGroups: 0,
        emailUniqueIndexPresent: true,
        idempotencyUniqueIndexPresent: true,
      }).ready,
    ).toBe(true);
    expect(JSON.stringify(LEAD_EMAIL_UNIQUE_INDEX_SPEC.partialFilterExpression)).not.toContain("$ne");
    expect(JSON.stringify(LEAD_IDEMPOTENCY_UNIQUE_INDEX_SPEC.partialFilterExpression)).not.toContain("$ne");
    expect(
      buildDuplicateArchiveAttributes({
        canonicalLeadId: "can",
        runId: "run",
        archivedAt: new Date("2026-08-31T10:00:00.000Z"),
      }).duplicateReconciliation,
    ).toMatchObject({
      canonicalLeadId: "can",
      archivedReason: "duplicate_of_canonical",
    });
  });
});
