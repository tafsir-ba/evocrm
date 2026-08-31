/**
 * CMP project membership policy (owner override).
 * Every HubSpot contact with product_intersted_in=CMP must be associated with
 * the EvoHome CMP project. Multi/other attribution → ADD CMP membership without
 * deleting or reassigning existing project leads (first-joined primary preserved).
 * No I/O. No PII in reports.
 */

import {
  hasCompletePilotName,
  hubspotContactIdempotencyKey,
  isEmailBearingNameless,
  resolveMigrationLeadIdentity,
  type GvPilotContactSnapshot,
} from "@/lib/hubspot-gv-pilot";
import {
  WD_CMP_PRODUCT_VALUE,
  WD_CMP_SLUG,
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_GV_PROJECT_ID,
} from "@/lib/hubspot-wd-project-migration";

export const CMP_PROJECT_ID = "6a9489ee84c29475f4dbc6c3";
export const CMP_PROJECT_REFERENCE = "CMP";
export const CMP_MEMBERSHIP_INBOUND_SOURCE = "hubspot-wd-project";

export type CmpMembershipRole = "primary" | "additional";

export type CmpMembershipDecision =
  | {
      action: "already_on_cmp";
      role: CmpMembershipRole | null;
      reason: string;
    }
  | {
      action: "create_cmp_membership";
      role: CmpMembershipRole;
      reason: string;
      idempotencyKey: string;
    }
  | {
      action: "park";
      reason: string;
    };

export function hubspotCmpProjectIdempotencyKey(contactId: string): string {
  return `hubspot:contact:${contactId}:project:${CMP_PROJECT_ID}`;
}

export function contactHasCmpProductSignal(
  productValues: string[] | null | undefined,
): boolean {
  return (productValues ?? []).includes(WD_CMP_PRODUCT_VALUE);
}

/**
 * Decide how to ensure CMP membership for one HubSpot contact.
 * Never suggests General or GV as CMP destination. Never reassigns other projects.
 */
export function decideCmpMembership(input: {
  snapshot: GvPilotContactSnapshot;
  /** Lead already on CMP project (by HubSpot ID or email). */
  existingOnCmp: boolean;
  /** Classic hubspot:contact:{id} key already used on any lead. */
  classicKeyTakenElsewhere: boolean;
  /** Any CRM lead for this HubSpot ID outside CMP. */
  hasHubspotLeadElsewhere: boolean;
}): CmpMembershipDecision {
  const { snapshot } = input;
  if (!contactHasCmpProductSignal(snapshot.productValues)) {
    return { action: "park", reason: "not_cmp_product" };
  }
  if (input.existingOnCmp) {
    return { action: "already_on_cmp", role: null, reason: "cmp_membership_present" };
  }
  if (!snapshot.emailNormalized && !snapshot.hasPhone) {
    return { action: "park", reason: "missing_email_and_phone" };
  }

  const projects = [...new Set(snapshot.projectValues.filter(Boolean))];
  const onlyCmpSignal =
    projects.length === 0 || (projects.length === 1 && projects[0] === WD_CMP_SLUG);
  const role: CmpMembershipRole =
    onlyCmpSignal && !input.hasHubspotLeadElsewhere ? "primary" : "additional";

  const classicKey = hubspotContactIdempotencyKey(snapshot.hubspotContactId);
  const projectKey = hubspotCmpProjectIdempotencyKey(snapshot.hubspotContactId);
  const idempotencyKey =
    role === "primary" && !input.classicKeyTakenElsewhere ? classicKey : projectKey;

  return {
    action: "create_cmp_membership",
    role,
    reason:
      role === "primary"
        ? "cmp_primary_membership"
        : "cmp_additional_membership_preserve_existing_primary",
    idempotencyKey,
  };
}

export function buildCmpMembershipAttributes(input: {
  contactId: string;
  integrationId: string;
  idempotencyKey: string;
  role: CmpMembershipRole;
  projectValues: string[];
  identity: ReturnType<typeof resolveMigrationLeadIdentity>;
  sourceCreatedAt?: string | null;
}): Record<string, unknown> {
  return {
    integration: {
      integrationId: input.integrationId,
      externalId: input.contactId,
      idempotencyKey: input.idempotencyKey,
      inboundSource: CMP_MEMBERSHIP_INBOUND_SOURCE,
      ...(input.sourceCreatedAt ? { sourceCreatedAt: input.sourceCreatedAt } : {}),
    },
    hubspotMigration: {
      ...(input.identity.nameMissing
        ? {
            nameMissing: true,
            needsEnrichment: true,
            ...(input.identity.displayLabel
              ? { displayLabel: input.identity.displayLabel }
              : {}),
          }
        : {}),
      cmpMembership: {
        role: input.role,
        destinationProjectId: CMP_PROJECT_ID,
        destinationReference: CMP_PROJECT_REFERENCE,
        firstJoinedPrimaryPreserved: input.role === "additional",
        hubspotProjectValuesAtJoin: input.projectValues,
        policy: "product_intersted_in_cmp_requires_cmp_membership",
      },
    },
  };
}

export function assertCmpDestinationAllowed(projectId: string): void {
  if (projectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
    throw new Error("cmp_membership_forbidden:general");
  }
  if (projectId === WD_MIGRATION_GV_PROJECT_ID) {
    throw new Error("cmp_membership_forbidden:gv");
  }
  if (projectId !== CMP_PROJECT_ID) {
    throw new Error("cmp_membership_forbidden:not_cmp");
  }
}

export function isNamelessEligibleForCmp(snapshot: GvPilotContactSnapshot): boolean {
  if (snapshot.emailNormalized) {
    return true;
  }
  if (snapshot.hasPhone && !hasCompletePilotName(snapshot.firstName, snapshot.lastName)) {
    return true;
  }
  return Boolean(snapshot.emailNormalized || snapshot.hasPhone);
}

export { isEmailBearingNameless, resolveMigrationLeadIdentity };
