/**
 * Fast path context for final migration — preloaded CRM indexes.
 * Used by the execute script to avoid per-contact Mongo round-trips.
 */
import "server-only";

import { buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import {
  buildMembershipProvenance,
} from "@/lib/lead-project-membership";
import {
  buildMigrationNameAttributes,
  type GvPilotContactSnapshot,
  type GvPilotExistingLead,
} from "@/lib/hubspot-gv-pilot";
import {
  assertGeneralFallbackAllowed,
  buildFinalMigrationAttributes,
  classicIdempotencyKey,
  decideFinalMigrationOutcome,
  resolveMigrationLeadIdentity,
  type MappedProject,
} from "@/lib/hubspot-final-migration-policy";
import {
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_INTEGRATION_ID,
  WD_MIGRATION_WORKSPACE_ID,
} from "@/lib/hubspot-wd-project-migration";
import { AppError } from "@/server/errors";
import { createMembership } from "@/server/repositories/lead-project-memberships";
import { createLeadForWorkspace } from "@/server/services/leads";
import { updateLead } from "@/server/repositories/leads";
import type { FinalMigrationResult } from "@/server/services/hubspot-final-migration";

export type FinalMigrationCache = {
  actorId: string;
  statusId: string;
  sourceId: string | undefined;
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  fallbackGeneralSlugs: ReadonlySet<string>;
  /** hubspot contact id → lead id */
  hubspotToLead: Map<string, string>;
  /** emailNormalized → { leadId, nameKey, hubspotIds } */
  emailIndex: Map<
    string,
    { leadId: string; nameKey: string; hubspotContactIds: string[] }
  >;
  /** leadId → set of projectIds with active membership */
  leadMemberships: Map<string, Set<string>>;
  /** leadId → primary projectId */
  leadPrimaryProject: Map<string, string>;
};

function existingForSnapshot(
  cache: FinalMigrationCache,
  snapshot: GvPilotContactSnapshot,
): GvPilotExistingLead[] {
  const existing: GvPilotExistingLead[] = [];
  const leadId = cache.hubspotToLead.get(snapshot.hubspotContactId);
  if (leadId) {
    const emailEntry = snapshot.emailNormalized
      ? cache.emailIndex.get(snapshot.emailNormalized)
      : undefined;
    existing.push({
      emailNormalized: snapshot.emailNormalized,
      nameKey: emailEntry?.nameKey ?? snapshot.nameKey,
      hubspotContactIds: [snapshot.hubspotContactId],
    });
  }
  if (snapshot.emailNormalized) {
    const byEmail = cache.emailIndex.get(snapshot.emailNormalized);
    if (byEmail) {
      existing.push({
        emailNormalized: snapshot.emailNormalized,
        nameKey: byEmail.nameKey,
        hubspotContactIds: byEmail.hubspotContactIds,
      });
    }
  }
  return existing;
}

async function addMembershipCached(input: {
  cache: FinalMigrationCache;
  leadId: string;
  projectId: string;
  contactId: string;
  sourceOrder: number;
}): Promise<"added" | "preexisting"> {
  const set = input.cache.leadMemberships.get(input.leadId) ?? new Set<string>();
  if (set.has(input.projectId)) {
    return "preexisting";
  }

  // Heal established primary from lead.projectId before adding secondaries.
  const establishedPrimary = input.cache.leadPrimaryProject.get(input.leadId);
  if (establishedPrimary && !set.has(establishedPrimary) && input.projectId !== establishedPrimary) {
    await createMembership({
      workspaceId: WD_MIGRATION_WORKSPACE_ID,
      leadId: input.leadId,
      projectId: establishedPrimary,
      isPrimary: true,
      joinedAt: new Date(),
      sourceOrder: 0,
      source: "backfill",
      provenance: buildMembershipProvenance({
        method: "backfill",
        source: "lead.projectId",
        notes: "Heal primary before additive HubSpot memberships.",
        hubspotContactId: input.contactId,
        sourceOrder: 0,
      }),
      createdBy: input.cache.actorId,
    });
    set.add(establishedPrimary);
  }

  const isPrimary = set.size === 0;
  await createMembership({
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    leadId: input.leadId,
    projectId: input.projectId,
    isPrimary,
    joinedAt: new Date(),
    sourceOrder: input.sourceOrder,
    source: "hubspot_association",
    provenance: buildMembershipProvenance({
      method: "hubspot_association",
      source: "hubspot_final_migration",
      notes: isPrimary
        ? "Primary membership from final migration create."
        : "Secondary membership; established primary preserved. No campaign enrollment.",
      hubspotContactId: input.contactId,
      sourceOrder: input.sourceOrder,
    }),
    createdBy: input.cache.actorId,
  });
  set.add(input.projectId);
  input.cache.leadMemberships.set(input.leadId, set);
  if (isPrimary) {
    input.cache.leadPrimaryProject.set(input.leadId, input.projectId);
  }
  return "added";
}

export async function ensureFinalMigrationOutcomeCached(input: {
  cache: FinalMigrationCache;
  snapshot: GvPilotContactSnapshot;
  properties?: Record<string, string | null>;
  persist: boolean;
}): Promise<FinalMigrationResult> {
  const { cache, snapshot } = input;
  const contactId = snapshot.hubspotContactId;
  const existing = existingForSnapshot(cache, snapshot);
  const decision = decideFinalMigrationOutcome({
    snapshot,
    existing,
    mappedBySlug: cache.mappedBySlug,
    fallbackGeneralSlugs: cache.fallbackGeneralSlugs,
  });

  if (!input.persist) {
    return {
      contactId,
      outcome:
        decision.action === "legacy_general"
          ? "legacy_general"
          : decision.action === "preexisting_email_dedupe"
            ? "deduped_linked"
            : decision.action === "already_represented"
              ? "preexisting"
              : "created",
      reason: decision.reason,
      leadId: cache.hubspotToLead.get(contactId) ?? null,
      membershipsAdded: 0,
      membershipsPreexisting: 0,
    };
  }

  try {
    if (decision.action === "already_represented") {
      return {
        contactId,
        outcome: "preexisting",
        reason: decision.reason,
        leadId: cache.hubspotToLead.get(contactId) ?? null,
        membershipsAdded: 0,
        membershipsPreexisting: 0,
      };
    }

    if (decision.action === "preexisting_email_dedupe") {
      const email = snapshot.emailNormalized!;
      const row = cache.emailIndex.get(email);
      if (!row) {
        return {
          contactId,
          outcome: "error",
          reason: "email_match_lead_missing",
          leadId: null,
          membershipsAdded: 0,
          membershipsPreexisting: 0,
        };
      }
      let linked = false;
      if (decision.backfillHubspotId && !cache.hubspotToLead.has(contactId)) {
        await updateLead(WD_MIGRATION_WORKSPACE_ID, row.leadId, {
          attributes: {
            integration: {
              integrationId: WD_MIGRATION_INTEGRATION_ID,
              externalId: contactId,
              idempotencyKey: classicIdempotencyKey(contactId),
              inboundSource: "hubspot-wd-project",
            },
            hubspotMigration: {
              hubspotIdBackfilled: true,
              policy: "hubspot_final_migration_v1",
            },
            ...buildMigratedCampaignGuardAttributes(),
          },
        });
        cache.hubspotToLead.set(contactId, row.leadId);
        row.hubspotContactIds = [...new Set([...row.hubspotContactIds, contactId])];
        linked = true;
      }
      return {
        contactId,
        outcome: "deduped_linked",
        reason: linked ? "email_match_hubspot_id_backfilled" : "email_match",
        leadId: row.leadId,
        membershipsAdded: 0,
        membershipsPreexisting: 1,
      };
    }

    const createLead = async (projectId: string, opts: {
      reason: string;
      evidence: import("@/lib/hubspot-final-migration-policy").AttributionEvidence;
      legacyGeneral?: boolean;
      omitEmail?: boolean;
    }) => {
      const existingLead = cache.hubspotToLead.get(contactId);
      if (existingLead) return { leadId: existingLead, created: false };

      const identity = resolveMigrationLeadIdentity(snapshot);
      const sourceCreatedAt =
        typeof input.properties?.createdate === "string"
          ? input.properties.createdate
          : null;
      const createdAt =
        sourceCreatedAt && !Number.isNaN(Date.parse(sourceCreatedAt))
          ? new Date(sourceCreatedAt)
          : undefined;
      const displayLabel =
        identity.displayLabel ??
        (opts.omitEmail || !snapshot.emailNormalized
          ? `hubspot:${contactId}`
          : undefined);
      const idempotencyKey = classicIdempotencyKey(contactId);

      try {
        const result = await createLeadForWorkspace(
          WD_MIGRATION_WORKSPACE_ID,
          cache.actorId,
          {
            projectId,
            statusId: cache.statusId,
            sourceId: cache.sourceId,
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: opts.omitEmail ? undefined : (snapshot.emailNormalized ?? undefined),
            phone: snapshot.hasPhone
              ? (input.properties?.phone ?? input.properties?.mobilephone ?? undefined) ??
                undefined
              : undefined,
            emailConsentStatus: "unknown",
            industry: input.properties?.industry ?? undefined,
            jobTitle: input.properties?.jobtitle ?? undefined,
            stateRegion:
              input.properties?.state ?? input.properties?.hs_state_code ?? undefined,
            attributes: {
              ...buildMigratedCampaignGuardAttributes(),
              ...buildMigrationNameAttributes(identity),
              ...buildFinalMigrationAttributes({
                contactId,
                integrationId: WD_MIGRATION_INTEGRATION_ID,
                idempotencyKey,
                decisionReason: opts.reason,
                evidence: opts.evidence,
                identity,
                sourceCreatedAt,
                legacyGeneral: opts.legacyGeneral,
                omitEmail: opts.omitEmail,
              }),
            },
            ...(createdAt ? { createdAt } : {}),
          },
          {
            triggerAutomation: false,
            displayFullName: displayLabel,
            intelligenceMethod: "hubspot",
            intelligenceSource: "hubspot_final_migration",
          },
        );
        cache.hubspotToLead.set(contactId, result.lead.id);
        cache.leadPrimaryProject.set(result.lead.id, projectId);
        cache.leadMemberships.set(result.lead.id, new Set([projectId]));
        if (snapshot.emailNormalized && !opts.omitEmail) {
          cache.emailIndex.set(snapshot.emailNormalized, {
            leadId: result.lead.id,
            nameKey: snapshot.nameKey,
            hubspotContactIds: [contactId],
          });
        }
        return { leadId: result.lead.id, created: true };
      } catch (error) {
        if (error instanceof AppError && error.code === "CONFLICT") {
          // refresh from email index
          if (snapshot.emailNormalized && cache.emailIndex.has(snapshot.emailNormalized)) {
            const row = cache.emailIndex.get(snapshot.emailNormalized)!;
            cache.hubspotToLead.set(contactId, row.leadId);
            return { leadId: row.leadId, created: false };
          }
        }
        throw error;
      }
    };

    if (decision.action === "legacy_general") {
      assertGeneralFallbackAllowed({
        evidence: decision.evidence,
        reason: decision.reason,
        destinationProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
      });
      const created = await createLead(WD_MIGRATION_GENERAL_PROJECT_ID, {
        reason: decision.reason,
        evidence: decision.evidence,
        legacyGeneral: true,
      });
      return {
        contactId,
        outcome: "legacy_general",
        reason: decision.reason,
        leadId: created.leadId,
        membershipsAdded: 0,
        membershipsPreexisting: created.created ? 0 : 1,
      };
    }

    const primary = decision.memberships.find((m) => m.isPrimary) ?? decision.memberships[0];
    if (!primary) {
      return {
        contactId,
        outcome: "error",
        reason: "empty_membership_plan",
        leadId: null,
        membershipsAdded: 0,
        membershipsPreexisting: 0,
      };
    }

    let leadId = cache.hubspotToLead.get(contactId) ?? null;
    let created = false;
    if (!leadId && decision.createLeadIfMissing) {
      const createdLead = await createLead(primary.projectId, {
        reason: decision.reason,
        evidence: decision.evidence,
        omitEmail: decision.omitEmailForIdentityConflict,
      });
      leadId = createdLead.leadId;
      created = createdLead.created;
    }
    if (!leadId) {
      return {
        contactId,
        outcome: "error",
        reason: "lead_missing_for_memberships",
        leadId: null,
        membershipsAdded: 0,
        membershipsPreexisting: 0,
      };
    }

    let added = 0;
    let preexisting = 0;
    for (const membership of decision.memberships) {
      const result = await addMembershipCached({
        cache,
        leadId,
        projectId: membership.projectId,
        contactId,
        sourceOrder: membership.sourceOrder,
      });
      if (result === "added") added += 1;
      else preexisting += 1;
    }

    return {
      contactId,
      outcome: created ? "created" : added > 0 ? "memberships_added" : "preexisting",
      reason: decision.reason,
      leadId,
      membershipsAdded: added,
      membershipsPreexisting: preexisting,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return {
      contactId,
      outcome: "error",
      reason: message.slice(0, 180),
      leadId: null,
      membershipsAdded: 0,
      membershipsPreexisting: 0,
    };
  }
}
