import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findActiveHubSpotIntegrationByPortalId,
  type IntegrationRecord,
} from "@/server/repositories/integrations";
import {
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
} from "@/server/repositories/leads";
import { findProjectById, findProjects } from "@/server/repositories/projects";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  assertHubSpotAccessToken,
  fetchHubSpotContact,
} from "@/server/services/hubspot-client";
import {
  buildWebsiteLeadPayloadSummary,
  writeIntegrationLog,
} from "@/server/services/integration-logs";
import { buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import { planHubSpotCmpLeadIntelligence } from "@/lib/hubspot-cmp-lead-intelligence";
import {
  isEvoHomeGeneralProjectId,
} from "@/lib/hubspot-final-migration-policy";
import { WD_MIGRATION_GENERAL_PROJECT_ID } from "@/lib/hubspot-wd-project-migration";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  createLeadForWorkspace,
  normalizeLeadEmail,
} from "@/server/services/leads";
import { decodeHubSpotCredentials, requireHubSpotClientSecret } from "@/server/security/integration-credentials";
import {
  isHubSpotContactCreationEvent,
  parseHubSpotWebhookEvents,
  verifyHubSpotSignatureV3,
  type HubSpotWebhookEvent,
} from "@/server/utils/hubspot-webhook";

export type HubSpotWebhookProcessSummary = {
  received: number;
  created: number;
  duplicates: number;
  skipped: number;
  failed: number;
};

async function resolveHubSpotDefaultProjectId(
  workspaceId: string,
  integration: IntegrationRecord,
): Promise<string> {
  if (integration.defaultProjectId) {
    const project = await findProjectById(workspaceId, integration.defaultProjectId);

    if (!project || project.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "HubSpot integration default project is missing or archived.",
      );
    }

    // Ongoing sync must never silently land on EvoHome General. Historical
    // legacy_general writes go through assertGeneralFallbackAllowed only.
    if (
      isEvoHomeGeneralProjectId(project.id) ||
      project.id === WD_MIGRATION_GENERAL_PROJECT_ID ||
      project.reference === "EVO-GENERAL"
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "HubSpot integration default project cannot be EvoHome General Database. General is last-resort migration fallback only.",
      );
    }

    return project.id;
  }

  const projects = await findProjects(workspaceId, { includeArchived: false });

  if (projects.length === 1) {
    const only = projects[0]!;
    if (isEvoHomeGeneralProjectId(only.id) || only.reference === "EVO-GENERAL") {
      throw new AppError(
        "VALIDATION_ERROR",
        "HubSpot integration default project cannot be EvoHome General Database.",
      );
    }
    return only.id;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Set a default project on the HubSpot integration.",
  );
}

async function resolveDefaultLeadStatusId(workspaceId: string): Promise<string> {
  const status = await findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "new");

  if (!status || !status.isActive) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Default lead status is not configured for this workspace.",
      { expose: false },
    );
  }

  return status.id;
}

async function resolveHubSpotLeadSourceId(workspaceId: string): Promise<string | null> {
  const hubspot = await findDictionaryItemByTypeAndKey(workspaceId, "lead_source", "hubspot");
  if (hubspot?.isActive) {
    return hubspot.id;
  }

  const website = await findDictionaryItemByTypeAndKey(workspaceId, "lead_source", "website");
  return website?.isActive ? website.id : null;
}

const HUBSPOT_WEBHOOK_AUTH_ERROR = "Invalid HubSpot webhook.";

async function ensureCmpMembershipIfNeeded(input: {
  workspaceId: string;
  actorId: string;
  contactId: string;
  properties: Record<string, string | null>;
}): Promise<void> {
  const product = String(input.properties.product_intersted_in ?? "");
  if (!product.split(/[;|]/).map((part) => part.trim()).includes("CMP")) {
    return;
  }
  const { ensureCmpMembershipFromHubSpotProperties } = await import(
    "@/server/services/hubspot-cmp-membership"
  );
  await ensureCmpMembershipFromHubSpotProperties({
    contactId: input.contactId,
    properties: input.properties,
    actorId: input.actorId,
    persist: true,
  });
}

export async function resolveHubSpotIntegrationFromPortalId(
  portalId: string,
): Promise<IntegrationRecord> {
  const active = await findActiveHubSpotIntegrationByPortalId(portalId);

  if (active) {
    return active;
  }

  // Lookup may exist (paused/archived) or not — never reveal which to the caller.
  throw new AppError("FORBIDDEN", HUBSPOT_WEBHOOK_AUTH_ERROR, {
    expose: false,
  });
}

async function captureHubSpotContactAsLead(input: {
  integration: IntegrationRecord;
  contactId: string;
  eventId?: string;
}): Promise<{ leadId: string; duplicate: boolean; skipped?: boolean }> {
  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  const workspaceId = input.integration.workspaceId;
  const idempotencyKey = `hubspot:contact:${input.contactId}`;

  await createAuditLog({
    workspaceId,
    actorId: input.integration.createdBy,
    action: "integration.hubspot_lead_received",
    entityType: "integration",
    entityId: input.integration.id,
    after: {
      contactId: input.contactId,
      ...(input.eventId ? { hubspotEventId: input.eventId } : {}),
    },
  });

  await ensureDefaultDictionaries(workspaceId);

  const existingByKey = await findLeadByIntegrationIdempotencyKey(
    workspaceId,
    input.integration.id,
    idempotencyKey,
  );

  if (existingByKey) {
    await writeIntegrationLog({
      workspaceId,
      integrationId: input.integration.id,
      direction: "inbound",
      status: "success",
      eventType: "hubspot.contact.duplicate",
      payloadSummary: buildWebsiteLeadPayloadSummary({
        externalId: input.contactId,
        source: "hubspot",
        leadId: existingByKey.id,
        idempotent: true,
      }),
    });

    await createAuditLog({
      workspaceId,
      actorId: input.integration.createdBy,
      action: "integration.hubspot_lead_duplicate",
      entityType: "lead",
      entityId: existingByKey.id,
    });

    try {
      const contactForCmp = await fetchHubSpotContact({
        accessToken: credentials.accessToken,
        contactId: input.contactId,
      });
      await ensureCmpMembershipIfNeeded({
        workspaceId,
        actorId: input.integration.createdBy,
        contactId: input.contactId,
        properties: contactForCmp.properties,
      });
    } catch {
      // Membership ensure is best-effort on duplicate path; do not fail capture.
    }

    return { leadId: existingByKey.id, duplicate: true };
  }

  const contact = await fetchHubSpotContact({
    accessToken: credentials.accessToken,
    contactId: input.contactId,
  });

  if (!contact.email && !contact.phone) {
    await writeIntegrationLog({
      workspaceId,
      integrationId: input.integration.id,
      direction: "inbound",
      status: "failed",
      eventType: "hubspot.contact.skipped",
      payloadSummary: {
        contactId: contact.id,
        reason: "missing_email_and_phone",
      },
    });
    return { leadId: "", duplicate: false, skipped: true };
  }

  const projectId = await resolveHubSpotDefaultProjectId(workspaceId, input.integration);
  const emailFields = contact.email ? normalizeLeadEmail(contact.email) : null;

  if (emailFields?.emailNormalized) {
    const existingByEmail = await findActiveLeadByEmailNormalized(
      workspaceId,
      emailFields.emailNormalized,
      undefined,
      projectId,
    );

    if (existingByEmail) {
      await writeIntegrationLog({
        workspaceId,
        integrationId: input.integration.id,
        direction: "inbound",
        status: "success",
        eventType: "hubspot.contact.duplicate",
        payloadSummary: buildWebsiteLeadPayloadSummary({
          externalId: contact.id,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          source: "hubspot",
          leadId: existingByEmail.id,
          duplicate: true,
        }),
      });

      await createAuditLog({
        workspaceId,
        actorId: input.integration.createdBy,
        action: "integration.hubspot_lead_duplicate",
        entityType: "lead",
        entityId: existingByEmail.id,
      });

      try {
        await ensureCmpMembershipIfNeeded({
          workspaceId,
          actorId: input.integration.createdBy,
          contactId: contact.id,
          properties: contact.properties,
        });
      } catch {
        // best-effort
      }

      return { leadId: existingByEmail.id, duplicate: true };
    }
  }

  const statusId = await resolveDefaultLeadStatusId(workspaceId);
  const sourceId = await resolveHubSpotLeadSourceId(workspaceId);
  const resolvedCompany = await resolveOrCreateCompanyByName(
    workspaceId,
    input.integration.createdBy,
    contact.properties.company,
  );
  const intelligence = planHubSpotCmpLeadIntelligence({
    snapshot: {
      contactId: contact.id,
      properties: contact.properties,
    },
    existing: {
      industry: null,
      jobTitle: null,
      stateRegion: null,
      companyId: null,
    },
    resolvedCompanyId: resolvedCompany?.company.id ?? null,
    requireCmpProduct: false,
  });

  const noteParts = [
    contact.properties.city || contact.properties.country
      ? `Location: ${[contact.properties.city, contact.properties.country].filter(Boolean).join(", ")}`
      : null,
    contact.properties.message ? contact.properties.message : null,
  ].filter(Boolean);

  const leadInput = {
    projectId,
    statusId,
    sourceId: sourceId ?? undefined,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
    industry: intelligence.values.industry,
    jobTitle: intelligence.values.jobTitle,
    stateRegion: intelligence.values.stateRegion,
    companyId: intelligence.values.companyId ?? undefined,
    emailConsentStatus: "unknown" as const,
    attributes: {
      integration: {
        integrationId: input.integration.id,
        externalId: contact.id,
        idempotencyKey,
        inboundSource: "hubspot",
        ...(contact.createdAt ? { sourceCreatedAt: contact.createdAt } : {}),
        ...(contact.properties.product_intersted_in
          ? { productInterestedIn: contact.properties.product_intersted_in }
          : {}),
        ...(input.eventId ? { hubspotEventId: String(input.eventId) } : {}),
      },
      ...buildMigratedCampaignGuardAttributes(),
    },
  };

  let result;

  try {
    result = await createLeadForWorkspace(
      workspaceId,
      input.integration.createdBy,
      leadInput,
      {
        triggerAutomation: false,
        intelligenceMethod: "hubspot",
        intelligenceSource: "hubspot_lead_capture",
      },
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const duplicateByKey = await findLeadByIntegrationIdempotencyKey(
        workspaceId,
        input.integration.id,
        idempotencyKey,
      );

      if (duplicateByKey) {
        await writeIntegrationLog({
          workspaceId,
          integrationId: input.integration.id,
          direction: "inbound",
          status: "success",
          eventType: "hubspot.contact.duplicate",
          payloadSummary: buildWebsiteLeadPayloadSummary({
            externalId: contact.id,
            email: contact.email ?? undefined,
            phone: contact.phone ?? undefined,
            source: "hubspot",
            leadId: duplicateByKey.id,
            idempotent: true,
          }),
        });

        await createAuditLog({
          workspaceId,
          actorId: input.integration.createdBy,
          action: "integration.hubspot_lead_duplicate",
          entityType: "lead",
          entityId: duplicateByKey.id,
        });

        return { leadId: duplicateByKey.id, duplicate: true };
      }

      if (emailFields?.emailNormalized) {
        const duplicateByEmail = await findActiveLeadByEmailNormalized(
          workspaceId,
          emailFields.emailNormalized,
          undefined,
          projectId,
        );

        if (duplicateByEmail) {
          await writeIntegrationLog({
            workspaceId,
            integrationId: input.integration.id,
            direction: "inbound",
            status: "success",
            eventType: "hubspot.contact.duplicate",
            payloadSummary: buildWebsiteLeadPayloadSummary({
              externalId: contact.id,
              email: contact.email ?? undefined,
              phone: contact.phone ?? undefined,
              source: "hubspot",
              leadId: duplicateByEmail.id,
              duplicate: true,
            }),
          });

          await createAuditLog({
            workspaceId,
            actorId: input.integration.createdBy,
            action: "integration.hubspot_lead_duplicate",
            entityType: "lead",
            entityId: duplicateByEmail.id,
          });

          return { leadId: duplicateByEmail.id, duplicate: true };
        }
      }
    }

    await writeIntegrationLog({
      workspaceId,
      integrationId: input.integration.id,
      direction: "inbound",
      status: "failed",
      eventType: "hubspot.contact.failed",
      payloadSummary: {
        contactId: contact.id,
        reason: "create_failed",
      },
      error,
    }).catch(() => undefined);

    await createAuditLog({
      workspaceId,
      actorId: input.integration.createdBy,
      action: "integration.hubspot_lead_failed",
      entityType: "integration",
      entityId: input.integration.id,
      after: {
        contactId: contact.id,
        error: error instanceof Error ? error.message : "unknown",
      },
    }).catch(() => undefined);

    throw error;
  }

  await writeIntegrationLog({
    workspaceId,
    integrationId: input.integration.id,
    direction: "inbound",
    status: "success",
    eventType: "hubspot.contact.created",
    payloadSummary: buildWebsiteLeadPayloadSummary({
      externalId: contact.id,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      source: "hubspot",
      leadId: result.lead.id,
    }),
  });

  await createAuditLog({
    workspaceId,
    actorId: input.integration.createdBy,
    action: "integration.hubspot_lead_created",
    entityType: "lead",
    entityId: result.lead.id,
    after: {
      integrationId: input.integration.id,
      hubspotContactId: contact.id,
    },
  });

  try {
    await ensureCmpMembershipIfNeeded({
      workspaceId,
      actorId: input.integration.createdBy,
      contactId: contact.id,
      properties: contact.properties,
    });
  } catch {
    // CMP membership ensure must not fail primary capture.
  }

  return { leadId: result.lead.id, duplicate: false };
}

export async function processHubSpotWebhookRequest(input: {
  method: string;
  uri: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): Promise<HubSpotWebhookProcessSummary> {
  const payload = JSON.parse(input.rawBody) as unknown;
  const events = parseHubSpotWebhookEvents(payload);

  const summary: HubSpotWebhookProcessSummary = {
    received: events.length,
    created: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
  };

  if (events.length === 0) {
    return summary;
  }

  const portalId = String(events[0].portalId ?? "");

  if (!portalId) {
    throw new AppError("VALIDATION_ERROR", "HubSpot webhook is missing portalId.");
  }

  const integration = await resolveHubSpotIntegrationFromPortalId(portalId);
  const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
  const clientSecret = requireHubSpotClientSecret(credentials);

  verifyHubSpotSignatureV3({
    method: input.method,
    uri: input.uri,
    rawBody: input.rawBody,
    timestampHeader: input.timestampHeader,
    signatureHeader: input.signatureHeader,
    clientSecret,
  });

  // Preflight token once per batch so bad tokens fail loudly.
  await assertHubSpotAccessToken(credentials.accessToken);

  const creationEvents = events.filter(isHubSpotContactCreationEvent);
  const seenContactIds = new Set<string>();

  for (const event of creationEvents) {
    const contactId = String(event.objectId);

    if (seenContactIds.has(contactId)) {
      summary.skipped += 1;
      continue;
    }
    seenContactIds.add(contactId);

    try {
      const result = await captureHubSpotContactAsLead({
        integration,
        contactId,
        eventId: event.eventId !== undefined ? String(event.eventId) : undefined,
      });

      if (result.skipped) {
        summary.skipped += 1;
      } else if (result.duplicate) {
        summary.duplicates += 1;
      } else {
        summary.created += 1;
      }
    } catch (error) {
      summary.failed += 1;
      await writeIntegrationLog({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        direction: "inbound",
        status: "failed",
        eventType: "hubspot.contact.failed",
        payloadSummary: {
          contactId,
          portalId,
          subscriptionType: event.subscriptionType ?? null,
        },
        error,
      }).catch(() => undefined);
    }
  }

  summary.skipped += Math.max(0, events.length - creationEvents.length);

  return summary;
}

/** Exported for unit tests. */
export async function processHubSpotContactCreationEventForTests(
  integration: IntegrationRecord,
  event: HubSpotWebhookEvent,
) {
  return captureHubSpotContactAsLead({
    integration,
    contactId: String(event.objectId),
    eventId: event.eventId !== undefined ? String(event.eventId) : undefined,
  });
}
