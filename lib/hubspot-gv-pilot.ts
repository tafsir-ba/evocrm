/**
 * Grosvenor Vistas first-write pilot — pure eligibility and manifest rules.
 * No I/O. Never include PII in logs or reports.
 */

import { createHash } from "node:crypto";

export const GV_PILOT_SLUG = "grosvenorvistas";
export const GV_PILOT_PORTAL_ID = "5699191";
export const GV_PILOT_WORKSPACE_ID = "6a2f0444438006b304af77ec";
export const GV_PILOT_PROJECT_ID = "6a2f13d144d6c01e4213ada9";
export const GV_PILOT_PROJECT_REFERENCE = "GV";
export const GV_PILOT_GENERAL_PROJECT_ID = "6a93f020cabcb5fdbee2df20";
export const GV_PILOT_INTEGRATION_ID = "6a9342124b53bc66c95495ce";
export const GV_PILOT_BATCH_SIZE = 25;
export const GV_PILOT_REMAINING_MAX = 522;
export const GV_PILOT_DEFAULT_MANIFEST = "gv-pilot-batch-01";
export const GV_PILOT_REMAINING_MANIFEST = "gv-pilot-batch-02";
export const GV_PILOT_ABORT_THRESHOLD = 1;
export const GV_PILOT_INBOUND_SOURCE = "hubspot-gv-pilot";
export const GV_PILOT_MANIFEST_DIR = "migrations/hubspot-gv-pilot";

export const GV_PILOT_HUBSPOT_PROPERTIES = [
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

export const GV_PILOT_SIDE_EFFECT_GUARD = Object.freeze({
  triggerAutomation: false,
  writeMappings: false,
  writeWebhooks: false,
  writeIntegrationSettings: false,
  allowGeneralProject: false,
});

export const GV_PILOT_MANIFEST_PII_KEYS = [
  "email",
  "firstname",
  "lastname",
  "firstName",
  "lastName",
  "phone",
  "mobilephone",
  "emailNormalized",
  "fullName",
] as const;

export const GV_PILOT_EXCLUSION_REASONS = [
  "multi_project",
  "notes_conflict",
  "broker_only",
  "notes_only",
  "missing_name",
  "missing_email_and_phone",
  "email_match",
  "hubspot_id_match",
  "identity_conflict",
  "not_gv_project",
  "destination_not_gv",
  "cmp_product",
] as const;

export type GvPilotExclusionReason = (typeof GV_PILOT_EXCLUSION_REASONS)[number];

export type GvPilotContactSnapshot = {
  hubspotContactId: string;
  projectValues: string[];
  notesValues: string[];
  brokerPrefixes: string[];
  firstName: string;
  lastName: string;
  emailNormalized: string | null;
  hasPhone: boolean;
  nameKey: string;
  productValues: string[];
};

export type GvPilotExistingLead = {
  emailNormalized: string | null;
  nameKey: string;
  hubspotContactIds: string[];
};

export type GvPilotEligibility = {
  writeEligible: boolean;
  cohort:
    | "new_write_eligible"
    | "email_match_readonly"
    | "excluded";
  exclusions: GvPilotExclusionReason[];
};

export type GvPilotManifest = {
  name: string;
  version: 1;
  portalId: string;
  workspaceId: string;
  destinationProjectId: string;
  destinationReference: string;
  slug: string;
  size: number;
  selection: {
    pool: "new_write_eligible";
    sort: "hubspot_contact_id_asc";
    exclude: string[];
  };
  hubspotContactIds: string[];
  idChecksum: string;
};

export function hubspotContactIdempotencyKey(contactId: string): string {
  return `hubspot:contact:${contactId}`;
}

export function splitHubSpotMultiValue(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .replace(/\|/g, ";")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function brokerPrefixesFromValues(values: string[]): string[] {
  return values.map((value) => (value.includes(":") ? value.split(":", 1)[0]! : value));
}

export function normalizePilotEmail(email: string | null | undefined): string | null {
  const cleaned = String(email ?? "").trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizePilotNamePart(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function pilotNameKey(firstName: string, lastName: string): string {
  const first = normalizePilotNamePart(firstName);
  const last = normalizePilotNamePart(lastName);
  return first || last ? `${first}|${last}` : "";
}

export function hasCompletePilotName(firstName: string, lastName: string): boolean {
  return Boolean(normalizePilotNamePart(firstName) && normalizePilotNamePart(lastName));
}

/** Nameless on HubSpot but carrying a normalised email — approved for migration reclassification. */
export function isEmailBearingNameless(
  contact: Pick<GvPilotContactSnapshot, "firstName" | "lastName" | "emailNormalized">,
): boolean {
  return !hasCompletePilotName(contact.firstName, contact.lastName) && Boolean(contact.emailNormalized);
}

export type MigrationLeadIdentity = {
  firstName: string;
  lastName: string;
  nameMissing: boolean;
  needsEnrichment: boolean;
  /** Safe UI label from the normalised email; never an invented person name. */
  displayLabel: string | null;
};

/**
 * Resolve CRM identity for migrated leads. Never invents a person name from email.
 * Email-bearing nameless contacts keep blank first/last with nameMissing + needsEnrichment.
 */
export function resolveMigrationLeadIdentity(
  contact: Pick<GvPilotContactSnapshot, "firstName" | "lastName" | "emailNormalized">,
): MigrationLeadIdentity {
  const first = String(contact.firstName ?? "").trim();
  const last = String(contact.lastName ?? "").trim();
  if (hasCompletePilotName(first, last)) {
    return {
      firstName: first,
      lastName: last,
      nameMissing: false,
      needsEnrichment: false,
      displayLabel: null,
    };
  }
  if (contact.emailNormalized) {
    return {
      firstName: "",
      lastName: "",
      nameMissing: true,
      needsEnrichment: true,
      displayLabel: contact.emailNormalized,
    };
  }
  return {
    firstName: first,
    lastName: last,
    nameMissing: true,
    needsEnrichment: true,
    displayLabel: null,
  };
}

/** @deprecated Use resolveMigrationLeadIdentity — never invents names from email. */
export function resolveMigrationLeadNames(
  contact: Pick<GvPilotContactSnapshot, "firstName" | "lastName" | "emailNormalized">,
): { firstName: string; lastName: string; reclassifiedFromEmail: boolean } {
  const identity = resolveMigrationLeadIdentity(contact);
  return {
    firstName: identity.firstName,
    lastName: identity.lastName,
    reclassifiedFromEmail: identity.nameMissing && Boolean(identity.displayLabel),
  };
}

export function buildMigrationNameAttributes(
  identity: MigrationLeadIdentity,
): Record<string, unknown> {
  if (!identity.nameMissing) {
    return {};
  }
  return {
    hubspotMigration: {
      nameMissing: true,
      needsEnrichment: true,
      ...(identity.displayLabel ? { displayLabel: identity.displayLabel } : {}),
    },
  };
}

export function evaluateGvPilotEligibility(
  contact: GvPilotContactSnapshot,
  existing: GvPilotExistingLead[],
): GvPilotEligibility {
  const exclusions: GvPilotExclusionReason[] = [];
  const projects = new Set(contact.projectValues);
  const notes = new Set(contact.notesValues);
  const brokers = new Set(contact.brokerPrefixes);
  const inProject = projects.has(GV_PILOT_SLUG);
  const inNotes = notes.has(GV_PILOT_SLUG);
  const inBroker = brokers.has(GV_PILOT_SLUG);

  if (contact.productValues.includes("CMP")) {
    exclusions.push("cmp_product");
  }
  if (!inProject) {
    exclusions.push("not_gv_project");
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
  if (!hasCompletePilotName(contact.firstName, contact.lastName) && !contact.emailNormalized) {
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

export function assertDestinationIsGv(input: {
  projectId: string;
  projectReference: string | null;
  generalProjectId?: string;
}): void {
  if (input.projectId === (input.generalProjectId ?? GV_PILOT_GENERAL_PROJECT_ID)) {
    throw new Error("destination_not_gv: refused EVO-GENERAL routing");
  }
  if (input.projectId !== GV_PILOT_PROJECT_ID) {
    throw new Error("destination_not_gv: project id mismatch");
  }
  if (input.projectReference !== GV_PILOT_PROJECT_REFERENCE) {
    throw new Error("destination_not_gv: reference is not GV");
  }
}

export function parseExecuteArgs(argv: string[]): {
  execute: boolean;
  manifestName: string | null;
  confirmWrite: boolean;
} {
  const execute = argv.includes("--execute");
  let manifestName: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--manifest=")) {
      manifestName = arg.slice("--manifest=".length).trim() || null;
    } else if (arg === "--manifest") {
      manifestName = argv[index + 1]?.trim() || null;
    }
  }
  const confirmWrite =
    argv.includes("--confirm-write") || argv.includes("--confirm-write=true");
  return { execute, manifestName, confirmWrite };
}

export function canPersistWrites(args: {
  execute: boolean;
  manifestName: string | null;
  confirmWrite: boolean;
}): { ok: true; manifestName: string } | { ok: false; reason: string } {
  if (!args.execute) {
    return { ok: false, reason: "default_dry_run" };
  }
  if (!args.manifestName) {
    return { ok: false, reason: "execute_requires_manifest" };
  }
  if (!args.confirmWrite) {
    return { ok: false, reason: "execute_requires_confirm_write" };
  }
  return { ok: true, manifestName: args.manifestName };
}

export function selectPilotBatchIds(
  eligibleIds: string[],
  size = GV_PILOT_BATCH_SIZE,
): string[] {
  const unique = [...new Set(eligibleIds.filter(Boolean))];
  unique.sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
      return an - bn;
    }
    return a.localeCompare(b);
  });
  return unique.slice(0, size);
}

export function checksumContactIds(ids: string[]): string {
  return createHash("sha256").update(ids.join(",")).digest("hex");
}

export function resolveManifestFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("manifest_name_required");
  }
  const base = trimmed.endsWith(".json") ? trimmed.slice(0, -5) : trimmed;
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/.test(base)) {
    throw new Error("manifest_name_invalid");
  }
  return `${base}.json`;
}

export function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }
    return keys;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

export function assertManifestHasNoPii(raw: unknown): void {
  const keys = collectObjectKeys(raw);
  const forbidden = GV_PILOT_MANIFEST_PII_KEYS.filter((key) => keys.has(key));
  if (forbidden.length > 0) {
    throw new Error(`manifest_contains_pii_keys:${forbidden.join(",")}`);
  }
}

export function parseGvPilotManifest(raw: unknown): GvPilotManifest {
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
  if (hubspotContactIds.length < 1 || hubspotContactIds.length > GV_PILOT_REMAINING_MAX) {
    throw new Error("manifest_size_mismatch");
  }
  if (value.size !== hubspotContactIds.length) {
    throw new Error("manifest_size_field_mismatch");
  }
  if (value.portalId !== GV_PILOT_PORTAL_ID) {
    throw new Error("manifest_portal_mismatch");
  }
  if (value.workspaceId !== GV_PILOT_WORKSPACE_ID) {
    throw new Error("manifest_workspace_mismatch");
  }
  if (value.destinationProjectId !== GV_PILOT_PROJECT_ID) {
    throw new Error("manifest_destination_mismatch");
  }
  if (value.destinationReference !== GV_PILOT_PROJECT_REFERENCE) {
    throw new Error("manifest_reference_mismatch");
  }
  if (value.slug !== GV_PILOT_SLUG) {
    throw new Error("manifest_slug_mismatch");
  }
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
    portalId: GV_PILOT_PORTAL_ID,
    workspaceId: GV_PILOT_WORKSPACE_ID,
    destinationProjectId: GV_PILOT_PROJECT_ID,
    destinationReference: GV_PILOT_PROJECT_REFERENCE,
    slug: GV_PILOT_SLUG,
    size: GV_PILOT_BATCH_SIZE,
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

export function snapshotFromHubSpotProperties(
  contactId: string,
  properties: Record<string, string | null | undefined>,
): GvPilotContactSnapshot {
  const firstName = String(properties.firstname ?? "").trim();
  const lastName = String(properties.lastname ?? "").trim();
  const emailNormalized = normalizePilotEmail(properties.email);
  const phone =
    String(properties.phone ?? "").trim() || String(properties.mobilephone ?? "").trim();
  const projectValues = splitHubSpotMultiValue(properties.wd_project);
  const notesValues = splitHubSpotMultiValue(properties.hs_content_membership_notes);
  const brokerValues = splitHubSpotMultiValue(properties.wd_broker_assigned);
  return {
    hubspotContactId: contactId,
    projectValues,
    notesValues,
    brokerPrefixes: brokerPrefixesFromValues(brokerValues),
    firstName,
    lastName,
    emailNormalized,
    hasPhone: phone.length > 0,
    nameKey: pilotNameKey(firstName, lastName),
    productValues: splitHubSpotMultiValue(properties.product_intersted_in),
  };
}

export function hubspotContactIdsFromLeadAttributes(
  attributes: Record<string, unknown> | null | undefined,
): string[] {
  if (!attributes || typeof attributes !== "object") {
    return [];
  }
  const raw = attributes.integration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const integration = raw as Record<string, unknown>;
  const ids: string[] = [];
  const key = integration.idempotencyKey;
  if (typeof key === "string" && key.startsWith("hubspot:contact:")) {
    const id = key.slice("hubspot:contact:".length).trim();
    if (id) {
      ids.push(id);
    }
  }
  if (typeof integration.externalId === "string" && integration.externalId.trim()) {
    ids.push(integration.externalId.trim());
  }
  return [...new Set(ids)];
}

export function existingLeadFromRecord(input: {
  emailNormalized: string | null;
  firstName: string;
  lastName: string;
  attributes?: Record<string, unknown> | null;
}): GvPilotExistingLead {
  return {
    emailNormalized: input.emailNormalized,
    nameKey: pilotNameKey(input.firstName, input.lastName),
    hubspotContactIds: hubspotContactIdsFromLeadAttributes(input.attributes),
  };
}

export const GV_PILOT_UNEXPECTED_REASONS = [
  "hubspot_contact_missing",
  "eligibility_changed",
  "destination_not_gv",
  "create_duplicate_unexpected",
  "create_failed",
  "lead_project_mismatch",
  "automation_side_effect",
  "general_project_write",
  "persist_refused",
] as const;

export type GvPilotUnexpectedReason = (typeof GV_PILOT_UNEXPECTED_REASONS)[number];

export type GvPilotRecordOutcome =
  | "would_create"
  | "created"
  | "skipped"
  | "unexpected"
  | "aborted_unprocessed";

export function shouldAbortRun(
  unexpectedCount: number,
  threshold = GV_PILOT_ABORT_THRESHOLD,
): boolean {
  return unexpectedCount >= threshold;
}

export type GvPilotLiveWriteGate = {
  ready: boolean;
  blockers: string[];
};

export function buildLiveWriteGate(input: {
  persisted: boolean;
  mode: "dry-run" | "execute";
  manifestValid: boolean;
  size: number;
  wouldCreate: number;
  unexpected: number;
  emailMatchReadonly: number;
  excluded: number;
  destinationIsGv: boolean;
  mappingCount: number;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
  enrollmentCount: number;
  generalProjectTouched: boolean;
}): GvPilotLiveWriteGate {
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
  if (!input.destinationIsGv) {
    blockers.push("destination_not_gv");
  }
  if (input.mappingCount !== 0) {
    blockers.push("mapping_rows_present");
  }
  if (input.integrationDefaultProjectId !== GV_PILOT_PROJECT_ID) {
    blockers.push("integration_default_not_gv");
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

export function assertSideEffectGuard(
  guard: typeof GV_PILOT_SIDE_EFFECT_GUARD = GV_PILOT_SIDE_EFFECT_GUARD,
): void {
  if (guard.triggerAutomation !== false) {
    throw new Error("side_effect_guard:automation_must_be_suppressed");
  }
  if (guard.writeMappings || guard.writeWebhooks || guard.writeIntegrationSettings) {
    throw new Error("side_effect_guard:integration_mutations_forbidden");
  }
  if (guard.allowGeneralProject) {
    throw new Error("side_effect_guard:general_project_forbidden");
  }
}
