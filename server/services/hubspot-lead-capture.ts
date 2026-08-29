import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findActiveHubSpotIntegrationByPortalId,
  findHubSpotIntegrationByPortalId,
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
import {
  createLeadForWorkspace,
  normalizeLeadEmail,
} from "@/server/services/leads";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";
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

    return project.id;
  }

  const projects = await findProjects(workspaceId, { includeArchived: false });

  if (projects.length === 1) {
    return projects[0].id;
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

export async function resolveHubSpotIntegrationFromPortalId(
  portalId: string,
): Promise<IntegrationRecord> {
  const active = await findActiveHubSpotIntegrationByPortalId(portalId);

  if (active) {
    return active;
  }

  const existing = await findHubSpotIntegrationByPortalId(portalId);

  if (existing) {
    throw new AppError("FORBIDDEN", "HubSpot integration is not active.");
  }

  throw new AppError("NOT_FOUND", "No HubSpot integration configured for this portal.");
}

async function captureHubSpotContactAsLead(input: {
  integration: IntegrationRecord;
  contactId: string;
  eventId?: string;
}): Promise<{ leadId: string; duplicate: boolean; skipped?: boolean }> {
  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  const workspaceId = input.integration.workspaceId;
  const idempotencyKey = `hubspot:contact:${input.contactId}`;

  await ensureDefaultDictionaries(workspaceId);

  const existingByKey = await findLeadByIntegrationIdempotencyKey(
    workspaceId,
    input.integration.id,
    idempotencyKey,
  );

  if (existingByKey) {
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
        }),
      });
      return { leadId: existingByEmail.id, duplicate: true };
    }
  }

  const statusId = await resolveDefaultLeadStatusId(workspaceId);
  const sourceId = await resolveHubSpotLeadSourceId(workspaceId);
  const noteParts = [
    contact.properties.company ? `Company: ${contact.properties.company}` : null,
    contact.properties.jobtitle ? `Title: ${contact.properties.jobtitle}` : null,
    contact.properties.city || contact.properties.country
      ? `Location: ${[contact.properties.city, contact.properties.country].filter(Boolean).join(", ")}`
      : null,
    contact.properties.message ? contact.properties.message : null,
  ].filter(Boolean);

  const result = await createLeadForWorkspace(
    workspaceId,
    input.integration.createdBy,
    {
      projectId,
      statusId,
      sourceId: sourceId ?? undefined,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
      emailConsentStatus: "unknown",
      attributes: {
        integration: {
          integrationId: input.integration.id,
          externalId: contact.id,
          idempotencyKey,
          inboundSource: "hubspot",
          ...(input.eventId ? { hubspotEventId: String(input.eventId) } : {}),
        },
      },
    },
  );

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

  verifyHubSpotSignatureV3({
    method: input.method,
    uri: input.uri,
    rawBody: input.rawBody,
    timestampHeader: input.timestampHeader,
    signatureHeader: input.signatureHeader,
    clientSecret: credentials.clientSecret,
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
