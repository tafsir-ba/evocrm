/**
 * Ensure HubSpot CMP-product contacts have an EvoHome CMP project lead membership.
 * Adds CMP without deleting/reassigning other project leads. No automatic dripping.
 */
import "server-only";

import { buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import {
  hubspotContactIdempotencyKey,
  resolveMigrationLeadIdentity,
  snapshotFromHubSpotProperties,
  type GvPilotContactSnapshot,
} from "@/lib/hubspot-gv-pilot";
import {
  CMP_MEMBERSHIP_INBOUND_SOURCE,
  CMP_PROJECT_ID,
  CMP_PROJECT_REFERENCE,
  assertCmpDestinationAllowed,
  buildCmpMembershipAttributes,
  decideCmpMembership,
  hubspotCmpProjectIdempotencyKey,
  type CmpMembershipDecision,
} from "@/lib/hubspot-cmp-membership";
import {
  WD_MIGRATION_HUBSPOT_PROPERTIES,
  WD_MIGRATION_INTEGRATION_ID,
  WD_MIGRATION_WORKSPACE_ID,
} from "@/lib/hubspot-wd-project-migration";
import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
} from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { createLeadForWorkspace } from "@/server/services/leads";
import { connectDb } from "@/server/db/mongoose";
import mongoose from "mongoose";

export type EnsureCmpMembershipResult = {
  contactId: string;
  outcome: "created" | "preexisting" | "parked" | "error";
  reason: string;
  role: string | null;
  leadId: string | null;
  idempotencyKey: string | null;
};

async function findCmpLeadByHubspotContactId(
  workspaceId: string,
  contactId: string,
): Promise<{ id: string; projectId: string } | null> {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("mongo_db_unavailable");
  }
  const doc = await db.collection("leads").findOne(
    {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      projectId: new mongoose.Types.ObjectId(CMP_PROJECT_ID),
      archivedAt: null,
      $or: [
        { "attributes.integration.externalId": contactId },
        {
          "attributes.integration.idempotencyKey": hubspotContactIdempotencyKey(contactId),
        },
        {
          "attributes.integration.idempotencyKey": hubspotCmpProjectIdempotencyKey(contactId),
        },
      ],
    },
    { projection: { _id: 1, projectId: 1 } },
  );
  if (!doc) {
    return null;
  }
  return { id: doc._id.toString(), projectId: doc.projectId.toString() };
}

async function findAnyHubspotLeadElsewhere(
  workspaceId: string,
  contactId: string,
): Promise<boolean> {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("mongo_db_unavailable");
  }
  const doc = await db.collection("leads").findOne(
    {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      archivedAt: null,
      projectId: { $ne: new mongoose.Types.ObjectId(CMP_PROJECT_ID) },
      $or: [
        { "attributes.integration.externalId": contactId },
        {
          "attributes.integration.idempotencyKey": hubspotContactIdempotencyKey(contactId),
        },
      ],
    },
    { projection: { _id: 1 } },
  );
  return Boolean(doc);
}

export async function ensureCmpMembershipForSnapshot(input: {
  snapshot: GvPilotContactSnapshot;
  actorId: string;
  properties?: Record<string, string | null>;
  persist?: boolean;
}): Promise<EnsureCmpMembershipResult> {
  assertCmpDestinationAllowed(CMP_PROJECT_ID);
  const project = await findProjectById(WD_MIGRATION_WORKSPACE_ID, CMP_PROJECT_ID);
  if (!project || project.archivedAt || project.reference !== CMP_PROJECT_REFERENCE) {
    throw new Error("cmp_destination_project_mismatch");
  }

  const contactId = input.snapshot.hubspotContactId;
  const onCmp = await findCmpLeadByHubspotContactId(WD_MIGRATION_WORKSPACE_ID, contactId);
  if (onCmp) {
    return {
      contactId,
      outcome: "preexisting",
      reason: "cmp_membership_present",
      role: null,
      leadId: onCmp.id,
      idempotencyKey: null,
    };
  }

  if (input.snapshot.emailNormalized) {
    const byEmail = await findActiveLeadByEmailNormalized(
      WD_MIGRATION_WORKSPACE_ID,
      input.snapshot.emailNormalized,
      undefined,
      CMP_PROJECT_ID,
    );
    if (byEmail) {
      return {
        contactId,
        outcome: "preexisting",
        reason: "cmp_email_match",
        role: null,
        leadId: byEmail.id,
        idempotencyKey: null,
      };
    }
  }

  const classicTaken = Boolean(
    await findLeadByIntegrationIdempotencyKey(
      WD_MIGRATION_WORKSPACE_ID,
      WD_MIGRATION_INTEGRATION_ID,
      hubspotContactIdempotencyKey(contactId),
    ),
  );
  const elsewhere = await findAnyHubspotLeadElsewhere(WD_MIGRATION_WORKSPACE_ID, contactId);
  const decision: CmpMembershipDecision = decideCmpMembership({
    snapshot: input.snapshot,
    existingOnCmp: false,
    classicKeyTakenElsewhere: classicTaken,
    hasHubspotLeadElsewhere: elsewhere || classicTaken,
  });

  if (decision.action === "park") {
    return {
      contactId,
      outcome: "parked",
      reason: decision.reason,
      role: null,
      leadId: null,
      idempotencyKey: null,
    };
  }
  if (decision.action === "already_on_cmp") {
    return {
      contactId,
      outcome: "preexisting",
      reason: decision.reason,
      role: decision.role,
      leadId: null,
      idempotencyKey: null,
    };
  }

  if (input.persist === false) {
    return {
      contactId,
      outcome: "created",
      reason: decision.reason,
      role: decision.role,
      leadId: null,
      idempotencyKey: decision.idempotencyKey,
    };
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

  try {
    const result = await createLeadForWorkspace(
      WD_MIGRATION_WORKSPACE_ID,
      input.actorId,
      {
        projectId: CMP_PROJECT_ID,
        statusId: status.id,
        sourceId: source?.isActive ? source.id : undefined,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: input.snapshot.emailNormalized ?? undefined,
        phone: input.snapshot.hasPhone
          ? (input.properties?.phone ?? input.properties?.mobilephone ?? undefined) ?? undefined
          : undefined,
        emailConsentStatus: "unknown",
        attributes: {
          ...buildMigratedCampaignGuardAttributes(),
          ...buildCmpMembershipAttributes({
            contactId,
            integrationId: WD_MIGRATION_INTEGRATION_ID,
            idempotencyKey: decision.idempotencyKey,
            role: decision.role,
            projectValues: input.snapshot.projectValues,
            identity,
            sourceCreatedAt,
          }),
        },
        ...(createdAt ? { createdAt } : {}),
      },
      {
        triggerAutomation: false,
        displayFullName: identity.displayLabel ?? undefined,
      },
    );

    if (result.lead.projectId !== CMP_PROJECT_ID) {
      return {
        contactId,
        outcome: "error",
        reason: "wrong_destination",
        role: decision.role,
        leadId: result.lead.id,
        idempotencyKey: decision.idempotencyKey,
      };
    }

    return {
      contactId,
      outcome: "created",
      reason: decision.reason,
      role: decision.role,
      leadId: result.lead.id,
      idempotencyKey: decision.idempotencyKey,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const again = await findCmpLeadByHubspotContactId(WD_MIGRATION_WORKSPACE_ID, contactId);
      if (again) {
        return {
          contactId,
          outcome: "preexisting",
          reason: "cmp_conflict_recovered",
          role: decision.role,
          leadId: again.id,
          idempotencyKey: decision.idempotencyKey,
        };
      }
      if (input.snapshot.emailNormalized) {
        const byEmail = await findActiveLeadByEmailNormalized(
          WD_MIGRATION_WORKSPACE_ID,
          input.snapshot.emailNormalized,
          undefined,
          CMP_PROJECT_ID,
        );
        if (byEmail) {
          return {
            contactId,
            outcome: "preexisting",
            reason: "cmp_email_conflict_recovered",
            role: decision.role,
            leadId: byEmail.id,
            idempotencyKey: decision.idempotencyKey,
          };
        }
      }
    }
    return {
      contactId,
      outcome: "error",
      reason: error instanceof Error ? error.message.slice(0, 160) : "create_failed",
      role: decision.role,
      leadId: null,
      idempotencyKey: decision.idempotencyKey,
    };
  }
}

export async function ensureCmpMembershipFromHubSpotProperties(input: {
  contactId: string;
  properties: Record<string, string | null>;
  actorId: string;
  persist?: boolean;
}): Promise<EnsureCmpMembershipResult> {
  const snapshot = snapshotFromHubSpotProperties(input.contactId, input.properties);
  return ensureCmpMembershipForSnapshot({
    snapshot,
    actorId: input.actorId,
    properties: input.properties,
    persist: input.persist,
  });
}

export { CMP_PROJECT_ID, CMP_PROJECT_REFERENCE, WD_MIGRATION_HUBSPOT_PROPERTIES, CMP_MEMBERSHIP_INBOUND_SOURCE };
