/**
 * Parameterized HubSpot wd_project → Evohome project migration.
 * Requires an explicit source→destination mapping. Never uses the
 * Grosvenor Vistas fallback or EvoHome General.
 * No I/O. Never include PII in logs or reports.
 */

import {
  GV_PILOT_GENERAL_PROJECT_ID,
  GV_PILOT_INTEGRATION_ID,
  GV_PILOT_PORTAL_ID,
  GV_PILOT_PROJECT_ID,
  GV_PILOT_PROJECT_REFERENCE,
  GV_PILOT_SLUG,
  GV_PILOT_WORKSPACE_ID,
  assertManifestHasNoPii,
  checksumContactIds,
  normalizePilotNamePart,
  parseExecuteArgs,
  resolveManifestFileName,
  type GvPilotContactSnapshot,
  type GvPilotExistingLead,
} from "@/lib/hubspot-gv-pilot";

export type WdProjectEligibility = {
  writeEligible: boolean;
  cohort: "new_write_eligible" | "email_match_readonly" | "excluded";
  exclusions: string[];
};

export const WD_MIGRATION_PORTAL_ID = GV_PILOT_PORTAL_ID;
export const WD_MIGRATION_WORKSPACE_ID = GV_PILOT_WORKSPACE_ID;
export const WD_MIGRATION_INTEGRATION_ID = GV_PILOT_INTEGRATION_ID;
export const WD_MIGRATION_GV_PROJECT_ID = GV_PILOT_PROJECT_ID;
export const WD_MIGRATION_GV_REFERENCE = GV_PILOT_PROJECT_REFERENCE;
export const WD_MIGRATION_GENERAL_PROJECT_ID = GV_PILOT_GENERAL_PROJECT_ID;
export const WD_MIGRATION_GENERAL_REFERENCE = "EVO-GENERAL";
export const WD_MIGRATION_FORBIDDEN_SLUG = GV_PILOT_SLUG;
export const WD_MIGRATION_INBOUND_SOURCE = "hubspot-wd-project";
export const WD_MIGRATION_MANIFEST_DIR = "migrations/hubspot-wd-project";
export const WD_MIGRATION_MAX_BATCH = 4000;
export const WD_MIGRATION_ABORT_THRESHOLD = 1;

export const WD_MIGRATION_HUBSPOT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "mobilephone",
  "wd_project",
  "hs_content_membership_notes",
  "wd_broker_assigned",
  "product_intersted_in",
] as const;

export const WD_MIGRATION_SIDE_EFFECT_GUARD = Object.freeze({
  triggerAutomation: false,
  writeMappings: false,
  writeWebhooks: false,
  writeIntegrationSettings: false,
  allowGeneralProject: false,
  allowGrosvenorFallback: false,
});

export const WD_MIGRATION_EXCLUSION_REASONS = [
  "multi_project",
  "notes_conflict",
  "broker_only",
  "notes_only",
  "missing_name",
  "missing_email_and_phone",
  "email_match",
  "hubspot_id_match",
  "identity_conflict",
  "not_target_project",
  "destination_forbidden",
  "cmp_product",
] as const;

export type WdMigrationExclusionReason = (typeof WD_MIGRATION_EXCLUSION_REASONS)[number];

export type WdProjectMigrationManifest = {
  name: string;
  version: 1;
  portalId: string;
  workspaceId: string;
  destinationProjectId: string;
  destinationReference: string;
  slug: string;
  sourceHubSpotProjectId: string;
  size: number;
  selection: {
    pool: "new_write_eligible";
    sort: "hubspot_contact_id_asc";
    exclude: string[];
  };
  hubspotContactIds: string[];
  idChecksum: string;
};

export type WdMappedDestination = {
  hubspotProjectId: string;
  status: string;
  evoProjectId: string | null;
};

export function evaluateWdProjectEligibility(
  contact: GvPilotContactSnapshot,
  existing: GvPilotExistingLead[],
  slug: string,
): WdProjectEligibility {
  const exclusions: string[] = [];
  const projects = new Set(contact.projectValues);
  const notes = new Set(contact.notesValues);
  const brokers = new Set(contact.brokerPrefixes);
  const inProject = projects.has(slug);
  const inNotes = notes.has(slug);
  const inBroker = brokers.has(slug);

  if (contact.productValues.includes("CMP")) {
    exclusions.push("cmp_product");
  }
  if (!inProject) {
    exclusions.push("not_target_project");
  }
  if (inProject && projects.size > 1) {
    exclusions.push("multi_project");
  }
  if (inProject && notes.size > 0 && !(notes.size === 1 && inNotes)) {
    exclusions.push("notes_conflict");
  }
  if (inBroker && !inProject && !inNotes) {
    exclusions.push("broker_only");
  }
  if (inNotes && !inProject) {
    exclusions.push("notes_only");
  }
  if (!normalizePilotNamePart(contact.firstName) || !normalizePilotNamePart(contact.lastName)) {
    exclusions.push("missing_name");
  }
  if (!contact.emailNormalized && !contact.hasPhone) {
    exclusions.push("missing_email_and_phone");
  }

  const emailMatches = contact.emailNormalized
    ? existing.filter((lead) => lead.emailNormalized === contact.emailNormalized)
    : [];
  const hubspotIdMatch = existing.some((lead) =>
    lead.hubspotContactIds.includes(contact.hubspotContactId),
  );
  const identityConflict = emailMatches.some(
    (lead) => lead.nameKey && contact.nameKey && lead.nameKey !== contact.nameKey,
  );

  if (hubspotIdMatch) {
    exclusions.push("hubspot_id_match");
  }
  if (identityConflict) {
    exclusions.push("identity_conflict");
  } else if (emailMatches.length > 0) {
    exclusions.push("email_match");
  }

  if (exclusions.includes("email_match") && !exclusions.includes("identity_conflict")) {
    return { writeEligible: false, cohort: "email_match_readonly", exclusions };
  }
  if (exclusions.length > 0) {
    return { writeEligible: false, cohort: "excluded", exclusions };
  }
  return { writeEligible: true, cohort: "new_write_eligible", exclusions: [] };
}

export function assertExplicitMappedDestination(input: {
  slug: string;
  destinationProjectId: string;
  destinationReference: string;
  mapping: WdMappedDestination | null;
}): void {
  if (!input.slug || input.slug === WD_MIGRATION_FORBIDDEN_SLUG) {
    throw new Error("destination_forbidden: grosvenor_fallback_not_allowed");
  }
  if (input.destinationProjectId === WD_MIGRATION_GV_PROJECT_ID) {
    throw new Error("destination_forbidden: grosvenor_fallback_not_allowed");
  }
  if (input.destinationReference === WD_MIGRATION_GV_REFERENCE) {
    throw new Error("destination_forbidden: grosvenor_fallback_not_allowed");
  }
  if (input.destinationProjectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
    throw new Error("destination_forbidden: evo_general_not_allowed");
  }
  if (input.destinationReference === WD_MIGRATION_GENERAL_REFERENCE) {
    throw new Error("destination_forbidden: evo_general_not_allowed");
  }
  if (!input.mapping) {
    throw new Error("destination_forbidden: explicit_mapping_required");
  }
  if (input.mapping.hubspotProjectId !== input.slug) {
    throw new Error("destination_forbidden: mapping_slug_mismatch");
  }
  if (input.mapping.status !== "mapped") {
    throw new Error("destination_forbidden: mapping_not_mapped");
  }
  if (!input.mapping.evoProjectId || input.mapping.evoProjectId !== input.destinationProjectId) {
    throw new Error("destination_forbidden: mapping_destination_mismatch");
  }
}

export function assertSideEffectGuard(
  guard: typeof WD_MIGRATION_SIDE_EFFECT_GUARD = WD_MIGRATION_SIDE_EFFECT_GUARD,
): void {
  if (guard.triggerAutomation !== false) {
    throw new Error("side_effect_guard:automation_must_be_suppressed");
  }
  if (guard.writeMappings || guard.writeWebhooks || guard.writeIntegrationSettings) {
    throw new Error("side_effect_guard:integration_mutations_forbidden");
  }
  if (guard.allowGeneralProject || guard.allowGrosvenorFallback) {
    throw new Error("side_effect_guard:fallback_destinations_forbidden");
  }
}

export function parseWdProjectManifest(raw: unknown): WdProjectMigrationManifest {
  assertManifestHasNoPii(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("manifest_invalid");
  }
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    throw new Error("manifest_version_unsupported");
  }
  const hubspotContactIds = Array.isArray(value.hubspotContactIds)
    ? value.hubspotContactIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const unique = new Set(hubspotContactIds);
  if (unique.size !== hubspotContactIds.length) {
    throw new Error("manifest_duplicate_ids");
  }
  if (hubspotContactIds.length < 1 || hubspotContactIds.length > WD_MIGRATION_MAX_BATCH) {
    throw new Error("manifest_size_mismatch");
  }
  if (value.size !== hubspotContactIds.length) {
    throw new Error("manifest_size_field_mismatch");
  }
  if (value.portalId !== WD_MIGRATION_PORTAL_ID) {
    throw new Error("manifest_portal_mismatch");
  }
  if (value.workspaceId !== WD_MIGRATION_WORKSPACE_ID) {
    throw new Error("manifest_workspace_mismatch");
  }
  const slug = String(value.slug ?? "").trim();
  const sourceHubSpotProjectId = String(value.sourceHubSpotProjectId ?? slug).trim();
  const destinationProjectId = String(value.destinationProjectId ?? "").trim();
  const destinationReference = String(value.destinationReference ?? "").trim();
  if (!slug || slug === WD_MIGRATION_FORBIDDEN_SLUG) {
    throw new Error("manifest_slug_forbidden");
  }
  if (sourceHubSpotProjectId !== slug) {
    throw new Error("manifest_source_mismatch");
  }
  assertExplicitMappedDestination({
    slug,
    destinationProjectId,
    destinationReference,
    mapping: {
      hubspotProjectId: slug,
      status: "mapped",
      evoProjectId: destinationProjectId,
    },
  });
  const selection = value.selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("manifest_selection_invalid");
  }
  const selectionRecord = selection as Record<string, unknown>;
  if (selectionRecord.pool !== "new_write_eligible") {
    throw new Error("manifest_pool_invalid");
  }
  if (selectionRecord.sort !== "hubspot_contact_id_asc") {
    throw new Error("manifest_sort_invalid");
  }
  const expectedChecksum = checksumContactIds(hubspotContactIds);
  if (value.idChecksum !== expectedChecksum) {
    throw new Error("manifest_checksum_mismatch");
  }
  return {
    name: String(value.name ?? ""),
    version: 1,
    portalId: WD_MIGRATION_PORTAL_ID,
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    destinationProjectId,
    destinationReference,
    slug,
    sourceHubSpotProjectId,
    size: hubspotContactIds.length,
    selection: {
      pool: "new_write_eligible",
      sort: "hubspot_contact_id_asc",
      exclude: Array.isArray(selectionRecord.exclude)
        ? selectionRecord.exclude.map((item) => String(item))
        : [],
    },
    hubspotContactIds,
    idChecksum: expectedChecksum,
  };
}

export type WdMigrationLiveWriteGate = {
  ready: boolean;
  blockers: string[];
};

export function buildWdMigrationLiveWriteGate(input: {
  persisted: boolean;
  mode: "dry-run" | "execute";
  manifestValid: boolean;
  size: number;
  wouldCreate: number;
  unexpected: number;
  emailMatchReadonly: number;
  excluded: number;
  destinationIsMapped: boolean;
  destinationIsGv: boolean;
  destinationIsGeneral: boolean;
  mappingOk: boolean;
  integrationAllowOverride: boolean;
  enrollmentCount: number;
  generalProjectTouched: boolean;
}): WdMigrationLiveWriteGate {
  const blockers: string[] = [];
  if (!input.manifestValid) {
    blockers.push("manifest_invalid");
  }
  if (input.size < 1) {
    blockers.push("batch_empty");
  }
  if (input.wouldCreate !== input.size) {
    blockers.push("would_create_mismatch");
  }
  if (input.unexpected > 0) {
    blockers.push("unexpected_results");
  }
  if (input.emailMatchReadonly > 0) {
    blockers.push("email_match_in_batch");
  }
  if (input.excluded > 0) {
    blockers.push("excluded_records_in_batch");
  }
  if (!input.destinationIsMapped) {
    blockers.push("destination_not_explicitly_mapped");
  }
  if (input.destinationIsGv) {
    blockers.push("grosvenor_fallback_not_allowed");
  }
  if (input.destinationIsGeneral) {
    blockers.push("evo_general_not_allowed");
  }
  if (!input.mappingOk) {
    blockers.push("mapping_required");
  }
  if (input.integrationAllowOverride) {
    blockers.push("integration_override_enabled");
  }
  if (input.enrollmentCount > 0) {
    blockers.push("automation_enrollments_present");
  }
  if (input.generalProjectTouched) {
    blockers.push("general_project_touched");
  }
  if (input.persisted) {
    blockers.push("run_persisted_during_prepare");
  }
  if (input.mode !== "dry-run") {
    blockers.push("mode_not_dry_run");
  }
  return { ready: blockers.length === 0, blockers };
}

export function selectSortedContactIds(ids: string[]): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  unique.sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
      return an - bn;
    }
    return a.localeCompare(b);
  });
  return unique;
}

export { parseExecuteArgs, resolveManifestFileName };
