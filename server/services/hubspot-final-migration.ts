/**
 * Execute durable HubSpot → EvoHome outcomes for one contact.
 * Uses native lead project memberships. Preserves established primary.
 * General only via assertGeneralFallbackAllowed. Zero automatic dripping.
 */
import "server-only";

import { buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import {
  buildMigrationNameAttributes,
  snapshotFromHubSpotProperties,
  type GvPilotContactSnapshot,
  type GvPilotExistingLead,
} from "@/lib/hubspot-gv-pilot";
import {
  assertGeneralFallbackAllowed,
  buildFinalMigrationAttributes,
  classicIdempotencyKey,
  decideFinalMigrationOutcome,
  resolveMigrationLeadIdentity,
  type AttributionEvidence,
  type FinalMigrationDecision,
  type MappedProject,
  type MembershipPlanItem,
} from "@/lib/hubspot-final-migration-policy";
import {
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_INTEGRATION_ID,
  WD_MIGRATION_WORKSPACE_ID,
} from "@/lib/hubspot-wd-project-migration";
import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findLeadById,
  findLeadByIntegrationIdempotencyKey,
  updateLead,
} from "@/server/repositories/leads";
import { findMembershipByLeadAndProject } from "@/server/repositories/lead-project-memberships";
import { addLeadProjectMembership } from "@/server/services/lead-project-memberships";
import { createLeadForWorkspace } from "@/server/services/leads";
import { connectDb } from "@/server/db/mongoose";
import mongoose from "mongoose";

export type FinalMigrationResult = {
  contactId: string;
  outcome:
    | "created"
    | "memberships_added"
    | "preexisting"
    | "deduped_linked"
    | "legacy_general"
    | "error";
  reason: string;
  leadId: string | null;
  membershipsAdded: number;
  membershipsPreexisting: number;
};

async function findLeadIdByHubspotContactId(contactId: string): Promise<string | null> {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("mongo_db_unavailable");
  const classic = classicIdempotencyKey(contactId);
  const doc = await db.collection("leads").findOne(
    {
      workspaceId: new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
      archivedAt: null,
      $or: [
        { "attributes.integration.externalId": contactId },
        { "attributes.integration.idempotencyKey": classic },
        {
          "attributes.integration.idempotencyKey": {
            $regex: `^hubspot:contact:${contactId}(:|$)`,
          },
        },
      ],
    },
    { projection: { _id: 1 }, sort: { createdAt: 1 } },
  );
  return doc ? doc._id.toString() : null;
}

async function loadExistingIndexForEmail(
  emailNormalized: string | null,
): Promise<GvPilotExistingLead[]> {
  if (!emailNormalized) return [];
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("mongo_db_unavailable");
  const docs = await db
    .collection("leads")
    .find(
      {
        workspaceId: new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
        archivedAt: null,
        emailNormalized,
      },
      {
        projection: {
          emailNormalized: 1,
          firstName: 1,
          lastName: 1,
          "attributes.integration.externalId": 1,
          "attributes.integration.idempotencyKey": 1,
        },
      },
    )
    .toArray();
  return docs.map((doc) => {
    const attrs = (doc.attributes ?? {}) as {
      integration?: { externalId?: string; idempotencyKey?: string };
    };
    const hubspotContactIds: string[] = [];
    if (attrs.integration?.externalId) {
      hubspotContactIds.push(String(attrs.integration.externalId));
    }
    const key = attrs.integration?.idempotencyKey;
    if (typeof key === "string" && key.startsWith("hubspot:contact:")) {
      const id = key.slice("hubspot:contact:".length).split(":")[0];
      if (id) hubspotContactIds.push(id);
    }
    const firstName = typeof doc.firstName === "string" ? doc.firstName : "";
    const lastName = typeof doc.lastName === "string" ? doc.lastName : "";
    return {
      emailNormalized: typeof doc.emailNormalized === "string" ? doc.emailNormalized : null,
      nameKey: `${firstName}|${lastName}`.toLowerCase(),
      hubspotContactIds: [...new Set(hubspotContactIds)],
    };
  });
}

async function loadExistingForContact(
  snapshot: GvPilotContactSnapshot,
): Promise<GvPilotExistingLead[]> {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("mongo_db_unavailable");
  const byId = await db.collection("leads").findOne(
    {
      workspaceId: new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
      archivedAt: null,
      $or: [
        { "attributes.integration.externalId": snapshot.hubspotContactId },
        {
          "attributes.integration.idempotencyKey": classicIdempotencyKey(
            snapshot.hubspotContactId,
          ),
        },
      ],
    },
    { projection: { emailNormalized: 1, firstName: 1, lastName: 1 } },
  );
  const existing: GvPilotExistingLead[] = [];
  if (byId) {
    const firstName = typeof byId.firstName === "string" ? byId.firstName : "";
    const lastName = typeof byId.lastName === "string" ? byId.lastName : "";
    existing.push({
      emailNormalized:
        typeof byId.emailNormalized === "string" ? byId.emailNormalized : null,
      nameKey: `${firstName}|${lastName}`.toLowerCase(),
      hubspotContactIds: [snapshot.hubspotContactId],
    });
  }
  const byEmail = await loadExistingIndexForEmail(snapshot.emailNormalized);
  for (const row of byEmail) {
    if (!existing.some((e) => e.hubspotContactIds.join() === row.hubspotContactIds.join() && e.emailNormalized === row.emailNormalized)) {
      existing.push(row);
    }
  }
  return existing;
}

async function ensureSecondaryMemberships(input: {
  leadId: string;
  actorId: string;
  memberships: MembershipPlanItem[];
  contactId: string;
  evidence: AttributionEvidence;
}): Promise<{ added: number; preexisting: number }> {
  let added = 0;
  let preexisting = 0;
  for (const membership of input.memberships) {
    const existing = await findMembershipByLeadAndProject(
      WD_MIGRATION_WORKSPACE_ID,
      input.leadId,
      membership.projectId,
    );
    if (existing) {
      preexisting += 1;
      continue;
    }
    try {
      await addLeadProjectMembership({
        workspaceId: WD_MIGRATION_WORKSPACE_ID,
        leadId: input.leadId,
        actorId: input.actorId,
        projectId: membership.projectId,
        isPrimary: false,
        source: "hubspot_association",
        joinedAt: new Date(),
        provenance: {
          method: "hubspot_association",
          source: "hubspot_final_migration",
          appliedAt: new Date().toISOString(),
          notes: "Secondary membership; established primary preserved. No campaign enrollment.",
          hubspotContactId: input.contactId,
          sourceOrder: membership.sourceOrder,
        },
      });
      added += 1;
    } catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT") {
        preexisting += 1;
        continue;
      }
      throw error;
    }
  }
  return { added, preexisting };
}

async function createMigrationLead(input: {
  snapshot: GvPilotContactSnapshot;
  actorId: string;
  projectId: string;
  decision: FinalMigrationDecision & { action: "ensure_memberships" | "legacy_general" };
  properties?: Record<string, string | null>;
  evidence: AttributionEvidence;
  reason: string;
  legacyGeneral?: boolean;
  omitEmail?: boolean;
}): Promise<{ leadId: string; created: boolean }> {
  const contactId = input.snapshot.hubspotContactId;
  const idempotencyKey = classicIdempotencyKey(contactId);
  const existingByKey = await findLeadByIntegrationIdempotencyKey(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
    idempotencyKey,
  );
  if (existingByKey) {
    return { leadId: existingByKey.id, created: false };
  }
  const byExternal = await findLeadIdByHubspotContactId(contactId);
  if (byExternal) {
    return { leadId: byExternal, created: false };
  }

  const status = await findDictionaryItemByTypeAndKey(
    WD_MIGRATION_WORKSPACE_ID,
    "lead_status",
    "new",
  );
  if (!status?.isActive) {
    throw new Error("lead_status_new_missing");
  }
  const source = await findDictionaryItemByTypeAndKey(
    WD_MIGRATION_WORKSPACE_ID,
    "lead_source",
    "hubspot",
  );

  const identity = resolveMigrationLeadIdentity(input.snapshot);
  const sourceCreatedAt =
    typeof input.properties?.createdate === "string" ? input.properties.createdate : null;
  const createdAt =
    sourceCreatedAt && !Number.isNaN(Date.parse(sourceCreatedAt))
      ? new Date(sourceCreatedAt)
      : undefined;

  const displayLabel =
    identity.displayLabel ??
    (input.omitEmail || !input.snapshot.emailNormalized
      ? `hubspot:${contactId}`
      : undefined);

  try {
    const result = await createLeadForWorkspace(
      WD_MIGRATION_WORKSPACE_ID,
      input.actorId,
      {
        projectId: input.projectId,
        statusId: status.id,
        sourceId: source?.isActive ? source.id : undefined,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: input.omitEmail ? undefined : (input.snapshot.emailNormalized ?? undefined),
        phone: input.snapshot.hasPhone
          ? (input.properties?.phone ?? input.properties?.mobilephone ?? undefined) ?? undefined
          : undefined,
        emailConsentStatus: "unknown",
        industry: input.properties?.industry ?? undefined,
        jobTitle: input.properties?.jobtitle ?? undefined,
        stateRegion: input.properties?.state ?? input.properties?.hs_state_code ?? undefined,
        attributes: {
          ...buildMigratedCampaignGuardAttributes(),
          ...buildMigrationNameAttributes(identity),
          ...buildFinalMigrationAttributes({
            contactId,
            integrationId: WD_MIGRATION_INTEGRATION_ID,
            idempotencyKey,
            decisionReason: input.reason,
            evidence: input.evidence,
            identity,
            sourceCreatedAt,
            legacyGeneral: input.legacyGeneral,
            omitEmail: input.omitEmail,
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
    return { leadId: result.lead.id, created: true };
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const again = await findLeadIdByHubspotContactId(contactId);
      if (again) return { leadId: again, created: false };
      const byKey = await findLeadByIntegrationIdempotencyKey(
        WD_MIGRATION_WORKSPACE_ID,
        WD_MIGRATION_INTEGRATION_ID,
        idempotencyKey,
      );
      if (byKey) return { leadId: byKey.id, created: false };
    }
    throw error;
  }
}

async function backfillHubspotIdOnLead(input: {
  leadId: string;
  contactId: string;
}): Promise<boolean> {
  const lead = await findLeadById(WD_MIGRATION_WORKSPACE_ID, input.leadId);
  if (!lead) return false;
  const attrs = (lead.attributes ?? {}) as Record<string, unknown>;
  const integration = {
    ...((attrs.integration as Record<string, unknown> | undefined) ?? {}),
  };
  const existingExternal =
    typeof integration.externalId === "string" ? integration.externalId : null;
  if (existingExternal && existingExternal !== input.contactId) {
    return false;
  }
  if (existingExternal === input.contactId) {
    return false;
  }
  integration.externalId = input.contactId;
  if (!integration.idempotencyKey) {
    integration.idempotencyKey = classicIdempotencyKey(input.contactId);
  }
  if (!integration.inboundSource) {
    integration.inboundSource = "hubspot-wd-project";
  }
  if (!integration.integrationId) {
    integration.integrationId = WD_MIGRATION_INTEGRATION_ID;
  }
  await updateLead(WD_MIGRATION_WORKSPACE_ID, input.leadId, {
    attributes: {
      ...attrs,
      integration,
      hubspotMigration: {
        ...((attrs.hubspotMigration as Record<string, unknown> | undefined) ?? {}),
        hubspotIdBackfilled: true,
        policy: "hubspot_final_migration_v1",
      },
    },
  });
  return true;
}

export async function ensureFinalMigrationOutcome(input: {
  snapshot: GvPilotContactSnapshot;
  actorId: string;
  mappedBySlug: ReadonlyMap<string, MappedProject>;
  fallbackGeneralSlugs: ReadonlySet<string>;
  properties?: Record<string, string | null>;
  persist?: boolean;
}): Promise<FinalMigrationResult> {
  const contactId = input.snapshot.hubspotContactId;
  const existing = await loadExistingForContact(input.snapshot);
  const decision = decideFinalMigrationOutcome({
    snapshot: input.snapshot,
    existing,
    mappedBySlug: input.mappedBySlug,
    fallbackGeneralSlugs: input.fallbackGeneralSlugs,
  });

  if (input.persist === false) {
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
      reason: decision.action === "already_represented" || decision.action === "preexisting_email_dedupe"
        ? decision.reason
        : decision.reason,
      leadId: null,
      membershipsAdded: 0,
      membershipsPreexisting: 0,
    };
  }

  try {
    if (decision.action === "already_represented") {
      const leadId = await findLeadIdByHubspotContactId(contactId);
      return {
        contactId,
        outcome: "preexisting",
        reason: decision.reason,
        leadId,
        membershipsAdded: 0,
        membershipsPreexisting: 0,
      };
    }

    if (decision.action === "preexisting_email_dedupe") {
      const emailLeads = await loadExistingIndexForEmail(input.snapshot.emailNormalized);
      // Prefer lead that already has this email; find concrete id
      await connectDb();
      const db = mongoose.connection.db;
      if (!db) throw new Error("mongo_db_unavailable");
      const doc = await db.collection("leads").findOne(
        {
          workspaceId: new mongoose.Types.ObjectId(WD_MIGRATION_WORKSPACE_ID),
          archivedAt: null,
          emailNormalized: input.snapshot.emailNormalized,
        },
        { projection: { _id: 1 }, sort: { createdAt: 1 } },
      );
      if (!doc) {
        return {
          contactId,
          outcome: "error",
          reason: "email_match_lead_missing",
          leadId: null,
          membershipsAdded: 0,
          membershipsPreexisting: 0,
        };
      }
      const leadId = doc._id.toString();
      let linked = false;
      if (decision.backfillHubspotId) {
        linked = await backfillHubspotIdOnLead({ leadId, contactId });
      }
      return {
        contactId,
        outcome: "deduped_linked",
        reason: linked ? "email_match_hubspot_id_backfilled" : "email_match",
        leadId,
        membershipsAdded: 0,
        membershipsPreexisting: emailLeads.length,
      };
    }

    if (decision.action === "legacy_general") {
      assertGeneralFallbackAllowed({
        evidence: decision.evidence,
        reason: decision.reason,
        destinationProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
      });
      if (decision.generalProjectId !== WD_MIGRATION_GENERAL_PROJECT_ID) {
        throw new Error("legacy_general_project_mismatch");
      }
      const created = await createMigrationLead({
        snapshot: input.snapshot,
        actorId: input.actorId,
        projectId: WD_MIGRATION_GENERAL_PROJECT_ID,
        decision,
        properties: input.properties,
        evidence: decision.evidence,
        reason: decision.reason,
        legacyGeneral: true,
        omitEmail: false,
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

    // ensure_memberships
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

    let leadId = await findLeadIdByHubspotContactId(contactId);
    let created = false;
    if (!leadId && decision.createLeadIfMissing) {
      const createdLead = await createMigrationLead({
        snapshot: input.snapshot,
        actorId: input.actorId,
        projectId: primary.projectId,
        decision,
        properties: input.properties,
        evidence: decision.evidence,
        reason: decision.reason,
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

    const secondary = decision.memberships.filter((m) => m.projectId !== primary.projectId || !created);
    // When just created on primary, ensure primary membership exists (createLead already does).
    // Add all memberships that are missing — including primary project if lead was elsewhere.
    const toAdd = decision.preserveExistingPrimary
      ? decision.memberships
      : secondary;
    const { added, preexisting } = await ensureSecondaryMemberships({
      leadId,
      actorId: input.actorId,
      memberships: toAdd,
      contactId,
      evidence: decision.evidence,
    });

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

export function snapshotForFinalMigration(
  contactId: string,
  properties: Record<string, string | null>,
): GvPilotContactSnapshot {
  return snapshotFromHubSpotProperties(contactId, properties);
}
