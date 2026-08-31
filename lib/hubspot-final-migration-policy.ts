/**
 * Final HubSpot → EvoHome migration policy (product/data-owner decisions).
 * Pure functions only. No I/O. No PII in reason codes.
 *
 * Durable outcomes for every source contact:
 * - usable Lead with correct project membership(s), or
 * - email-deduped preexisting with optional HubSpot ID linkage, or
 * - legacy/unassigned Lead on EvoHome General with explicit reason + HubSpot ID.
 *
 * General is last-resort only after exhaustive attribution finds no mapped project.
 * Never steal an established primary solely to add secondary memberships.
 */

import {
  hubspotContactIdempotencyKey,
  resolveMigrationLeadIdentity,
  type GvPilotContactSnapshot,
  type GvPilotExistingLead,
} from "@/lib/hubspot-gv-pilot";
import {
  WD_CMP_PRODUCT_VALUE,
  WD_CMP_SLUG,
  WD_MIGRATION_FORBIDDEN_SLUG,
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_GV_PROJECT_ID,
  resolveProductFieldProjectAttribution,
} from "@/lib/hubspot-wd-project-migration";

export const FINAL_MIGRATION_INBOUND_SOURCE = "hubspot-wd-project";
export const FINAL_MIGRATION_POLICY = "hubspot_final_migration_v1";

export type MappedProject = {
  slug: string;
  projectId: string;
  reference: string;
};

export type AttributionEvidence = {
  wdProjectSlugs: string[];
  notesSlugs: string[];
  brokerSlugs: string[];
  productValues: string[];
  triedRules: string[];
  mappedSlugs: string[];
  unmappedSlugs: string[];
  fallbackGeneralSlugs: string[];
  forbiddenSlugs: string[];
};

export type MembershipPlanItem = {
  slug: string;
  projectId: string;
  sourceOrder: number;
  isPrimary: boolean;
};

export type FinalMigrationDecision =
  | {
      action: "already_represented";
      reason: string;
      leadHint: "hubspot_id";
    }
  | {
      action: "preexisting_email_dedupe";
      reason: "email_match";
      backfillHubspotId: boolean;
    }
  | {
      action: "ensure_memberships";
      reason: string;
      memberships: MembershipPlanItem[];
      createLeadIfMissing: boolean;
      preserveExistingPrimary: true;
      omitEmailForIdentityConflict: boolean;
      evidence: AttributionEvidence;
      allowMissingContact: boolean;
    }
  | {
      action: "legacy_general";
      reason: string;
      evidence: AttributionEvidence;
      allowMissingContact: true;
      generalProjectId: typeof WD_MIGRATION_GENERAL_PROJECT_ID;
    };

export function buildAttributionEvidence(input: {
  snapshot: GvPilotContactSnapshot;
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  fallbackGeneralSlugs: ReadonlySet<string>;
}): AttributionEvidence {
  const { snapshot, mappedBySlug, fallbackGeneralSlugs } = input;
  const wd = unique(snapshot.projectValues);
  const notes = unique(snapshot.notesValues);
  const brokers = unique(snapshot.brokerPrefixes);
  const all = unique([...wd, ...notes, ...brokers]);
  const mappedSlugs: string[] = [];
  const unmappedSlugs: string[] = [];
  const fallbackGeneral: string[] = [];
  const forbidden: string[] = [];
  for (const slug of all) {
    if (slug === WD_MIGRATION_FORBIDDEN_SLUG) {
      forbidden.push(slug);
      continue;
    }
    if (fallbackGeneralSlugs.has(slug)) {
      fallbackGeneral.push(slug);
      continue;
    }
    if (mappedBySlug.has(slug)) {
      mappedSlugs.push(slug);
    } else {
      unmappedSlugs.push(slug);
    }
  }
  return {
    wdProjectSlugs: wd,
    notesSlugs: notes,
    brokerSlugs: brokers,
    productValues: unique(snapshot.productValues),
    triedRules: [],
    mappedSlugs,
    unmappedSlugs,
    fallbackGeneralSlugs: fallbackGeneral,
    forbiddenSlugs: forbidden,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Hard gate: General only when exhaustive attribution found zero mapped projects.
 */
export function assertGeneralFallbackAllowed(input: {
  evidence: AttributionEvidence;
  reason: string;
}): void {
  if (input.evidence.mappedSlugs.length > 0) {
    throw new Error(`general_fallback_forbidden:mapped_project_exists:${input.reason}`);
  }
  if (!input.reason.startsWith("legacy_general:") && !input.reason.startsWith("fallback_general:")) {
    if (
      !input.reason.startsWith("no_project_signal:") &&
      !input.reason.startsWith("forbidden_destination:") &&
      !input.reason.startsWith("unmapped_project:") &&
      !input.reason.startsWith("missing_email_and_phone:") &&
      !input.reason.startsWith("identity_conflict:")
    ) {
      throw new Error(`general_fallback_forbidden:invalid_reason:${input.reason}`);
    }
  }
}

export function planOrderedMemberships(input: {
  orderedSlugs: string[];
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  /** When true, first mapped slug is primary; otherwise all secondary (existing primary preserved). */
  assignPrimary: boolean;
}): MembershipPlanItem[] {
  const items: MembershipPlanItem[] = [];
  let order = 0;
  for (const slug of input.orderedSlugs) {
    const mapped = input.mappedBySlug.get(slug);
    if (!mapped) continue;
    if (mapped.projectId === WD_MIGRATION_GENERAL_PROJECT_ID) continue;
    if (mapped.projectId === WD_MIGRATION_GV_PROJECT_ID) continue;
    items.push({
      slug,
      projectId: mapped.projectId,
      sourceOrder: order,
      isPrimary: input.assignPrimary && items.length === 0,
    });
    order += 1;
  }
  return items;
}

/**
 * Prefer wd_project order; when blank, use product→CMP, then single notes, then single broker.
 * Competing notes-only multi signals keep all mapped notes as ordered memberships (not General).
 */
export function resolveOrderedAttributionSlugs(input: {
  snapshot: GvPilotContactSnapshot;
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  evidence: AttributionEvidence;
}): { slugs: string[]; rule: string; ambiguousCompeting: boolean } {
  const wd = unique(input.snapshot.projectValues);
  if (wd.length > 0) {
    return {
      slugs: wd,
      rule: wd.length > 1 ? "wd_project_multi_ordered" : "wd_project_single",
      ambiguousCompeting: false,
    };
  }

  const product = resolveProductFieldProjectAttribution({
    productValues: input.snapshot.productValues,
    projectValues: wd,
  });
  if (product && input.mappedBySlug.has(product.slug)) {
    return { slugs: [product.slug], rule: `product_field:${product.slug}`, ambiguousCompeting: false };
  }

  const mappedNotes = unique(input.snapshot.notesValues).filter((s) =>
    input.mappedBySlug.has(s),
  );
  if (mappedNotes.length > 0) {
    return {
      slugs: mappedNotes,
      rule:
        mappedNotes.length > 1
          ? "notes_mapped_multi_ordered"
          : "notes_mapped_single",
      ambiguousCompeting: mappedNotes.length > 1,
    };
  }

  const mappedBrokers = unique(input.snapshot.brokerPrefixes).filter((s) =>
    input.mappedBySlug.has(s),
  );
  if (mappedBrokers.length > 0) {
    return {
      slugs: mappedBrokers,
      rule:
        mappedBrokers.length > 1
          ? "broker_mapped_multi_ordered"
          : "broker_mapped_single",
      ambiguousCompeting: mappedBrokers.length > 1,
    };
  }

  // CMP product without wd still maps via product rule above; if CMP mapping missing, fall through.
  if (input.snapshot.productValues.includes(WD_CMP_PRODUCT_VALUE) && input.mappedBySlug.has(WD_CMP_SLUG)) {
    return { slugs: [WD_CMP_SLUG], rule: "product_field:CMP", ambiguousCompeting: false };
  }

  return { slugs: [], rule: "exhaustive_no_mapped_destination", ambiguousCompeting: false };
}

export function decideFinalMigrationOutcome(input: {
  snapshot: GvPilotContactSnapshot;
  existing: GvPilotExistingLead[];
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  fallbackGeneralSlugs: ReadonlySet<string>;
}): FinalMigrationDecision {
  const { snapshot, existing } = input;
  const evidence = buildAttributionEvidence({
    snapshot,
    mappedBySlug: input.mappedBySlug,
    fallbackGeneralSlugs: input.fallbackGeneralSlugs,
  });

  const hubspotIdMatch = existing.some((lead) =>
    lead.hubspotContactIds.includes(snapshot.hubspotContactId),
  );
  if (hubspotIdMatch) {
    // Still ensure missing secondary memberships when multi signals exist — handled by ensure path
    // via ensure_memberships when caller detects incomplete memberships. For decision purity:
    const attribution = resolveOrderedAttributionSlugs({
      snapshot,
      mappedBySlug: input.mappedBySlug,
      evidence,
    });
    evidence.triedRules.push("hubspot_id_match", attribution.rule);
    if (attribution.slugs.length > 0) {
      const memberships = planOrderedMemberships({
        orderedSlugs: attribution.slugs,
        mappedBySlug: input.mappedBySlug,
        assignPrimary: false,
      });
      if (memberships.length > 0) {
        return {
          action: "ensure_memberships",
          reason: `hubspot_id_present_ensure_memberships:${attribution.rule}`,
          memberships,
          createLeadIfMissing: false,
          preserveExistingPrimary: true,
          omitEmailForIdentityConflict: false,
          evidence,
          allowMissingContact: true,
        };
      }
    }
    return { action: "already_represented", reason: "hubspot_id_match", leadHint: "hubspot_id" };
  }

  const emailMatches = snapshot.emailNormalized
    ? existing.filter((lead) => lead.emailNormalized === snapshot.emailNormalized)
    : [];
  const identityConflict = emailMatches.some(
    (lead) => lead.nameKey && snapshot.nameKey && lead.nameKey !== snapshot.nameKey,
  );

  if (emailMatches.length > 0 && !identityConflict) {
    evidence.triedRules.push("email_match");
    return {
      action: "preexisting_email_dedupe",
      reason: "email_match",
      backfillHubspotId: true,
    };
  }

  const attribution = resolveOrderedAttributionSlugs({
    snapshot,
    mappedBySlug: input.mappedBySlug,
    evidence,
  });
  evidence.triedRules.push(attribution.rule);

  if (attribution.slugs.length > 0) {
    const memberships = planOrderedMemberships({
      orderedSlugs: attribution.slugs,
      mappedBySlug: input.mappedBySlug,
      assignPrimary: true,
    });
    if (memberships.length === 0) {
      // All attribution slugs were forbidden/general — fall through to legacy.
      evidence.triedRules.push("mapped_slugs_filtered_empty");
    } else {
      let reason = attribution.rule;
      if (identityConflict) {
        reason = `identity_conflict:${attribution.rule}`;
      } else if (evidence.wdProjectSlugs.length > 1) {
        reason = `multi_project:${attribution.rule}`;
      } else if (
        evidence.wdProjectSlugs.length === 1 &&
        evidence.notesSlugs.length > 0 &&
        !(evidence.notesSlugs.length === 1 && evidence.notesSlugs[0] === evidence.wdProjectSlugs[0])
      ) {
        reason = `notes_conflict:${attribution.rule}`;
      } else if (
        snapshot.productValues.includes(WD_CMP_PRODUCT_VALUE) &&
        evidence.wdProjectSlugs.length > 0 &&
        !(evidence.wdProjectSlugs.length === 1 && evidence.wdProjectSlugs[0] === WD_CMP_SLUG)
      ) {
        reason = `product_vs_wd_conflict:${attribution.rule}`;
      }

      return {
        action: "ensure_memberships",
        reason,
        memberships,
        createLeadIfMissing: true,
        preserveExistingPrimary: true,
        omitEmailForIdentityConflict: identityConflict,
        evidence,
        allowMissingContact: true,
      };
    }
  }

  // Exhaustive: no mapped destination.
  const missingContact = !snapshot.emailNormalized && !snapshot.hasPhone;
  if (evidence.fallbackGeneralSlugs.length > 0 && evidence.mappedSlugs.length === 0) {
    const slug = evidence.fallbackGeneralSlugs[0]!;
    const reason = `fallback_general:${slug}`;
    assertGeneralFallbackAllowed({ evidence, reason });
    return {
      action: "legacy_general",
      reason,
      evidence: { ...evidence, triedRules: [...evidence.triedRules, "fallback_general_last_resort"] },
      allowMissingContact: true,
      generalProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
    };
  }

  if (evidence.forbiddenSlugs.length > 0 && evidence.mappedSlugs.length === 0) {
    const reason = `forbidden_destination:${evidence.forbiddenSlugs[0]}`;
    assertGeneralFallbackAllowed({ evidence, reason });
    return {
      action: "legacy_general",
      reason,
      evidence: { ...evidence, triedRules: [...evidence.triedRules, "forbidden_to_general_legacy"] },
      allowMissingContact: true,
      generalProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
    };
  }

  if (evidence.unmappedSlugs.length > 0 && evidence.mappedSlugs.length === 0) {
    const reason = `unmapped_project:${evidence.unmappedSlugs[0]}`;
    assertGeneralFallbackAllowed({ evidence, reason });
    return {
      action: "legacy_general",
      reason,
      evidence: { ...evidence, triedRules: [...evidence.triedRules, "unmapped_to_general_legacy"] },
      allowMissingContact: true,
      generalProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
    };
  }

  const reason = missingContact
    ? "missing_email_and_phone:no_project_signal"
    : identityConflict
      ? "identity_conflict:no_mapped_destination"
      : attribution.ambiguousCompeting
        ? "no_project_signal:ambiguous_unmapped"
        : "no_project_signal:exhaustive_no_destination";
  assertGeneralFallbackAllowed({ evidence, reason });
  return {
    action: "legacy_general",
    reason,
    evidence: {
      ...evidence,
      triedRules: [...evidence.triedRules, "general_last_resort_exhaustive"],
    },
    allowMissingContact: true,
    generalProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
  };
}

export function classicIdempotencyKey(contactId: string): string {
  return hubspotContactIdempotencyKey(contactId);
}

export function projectScopedIdempotencyKey(contactId: string, projectId: string): string {
  return `hubspot:contact:${contactId}:project:${projectId}`;
}

export function buildFinalMigrationAttributes(input: {
  contactId: string;
  integrationId: string;
  idempotencyKey: string;
  decisionReason: string;
  evidence: AttributionEvidence;
  identity: ReturnType<typeof resolveMigrationLeadIdentity>;
  sourceCreatedAt?: string | null;
  legacyGeneral?: boolean;
  omitEmail?: boolean;
}): Record<string, unknown> {
  return {
    integration: {
      integrationId: input.integrationId,
      externalId: input.contactId,
      idempotencyKey: input.idempotencyKey,
      inboundSource: FINAL_MIGRATION_INBOUND_SOURCE,
      ...(input.sourceCreatedAt ? { sourceCreatedAt: input.sourceCreatedAt } : {}),
    },
    hubspotMigration: {
      policy: FINAL_MIGRATION_POLICY,
      decisionReason: input.decisionReason,
      attributionEvidence: input.evidence,
      ...(input.legacyGeneral
        ? {
            legacyArchive: true,
            legacyUnassigned: true,
            generalFallback: true,
          }
        : {}),
      ...(input.omitEmail ? { identityConflictEmailOmitted: true } : {}),
      ...(input.identity.nameMissing
        ? {
            nameMissing: true,
            needsEnrichment: true,
            ...(input.identity.displayLabel
              ? { displayLabel: input.identity.displayLabel }
              : {}),
          }
        : {}),
      ...(!input.identity.nameMissing && !input.identity.firstName && !input.identity.lastName
        ? { needsEnrichment: true }
        : {}),
    },
  };
}

export { resolveMigrationLeadIdentity };
