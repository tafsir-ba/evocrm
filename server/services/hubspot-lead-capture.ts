import "server-only";

import { AppError } from "@/server/errors";
import {
  findActiveHubSpotIntegrationByPortalId,
  type IntegrationRecord,
} from "@/server/repositories/integrations";
import { decodeHubSpotCredentials, requireHubSpotClientSecret } from "@/server/security/integration-credentials";
import { assertHubSpotAccessToken } from "@/server/services/hubspot-client";
import {
  processOngoingHubSpotContact,
  processOngoingHubSpotEvents,
  type HubSpotOngoingSyncSummary,
} from "@/server/services/hubspot-ongoing-sync";
import { ensureHubSpotSyncCursor } from "@/server/repositories/hubspot-sync-cursors";
import {
  collapseHubSpotEventsByContact,
  isHubSpotOngoingSyncEvent,
  parseHubSpotWebhookEvents,
  verifyHubSpotSignatureV3,
  type HubSpotWebhookEvent,
} from "@/server/utils/hubspot-webhook";

export type HubSpotWebhookProcessSummary = HubSpotOngoingSyncSummary;

const HUBSPOT_WEBHOOK_AUTH_ERROR = "Invalid HubSpot webhook.";

export async function resolveHubSpotIntegrationFromPortalId(
  portalId: string,
): Promise<IntegrationRecord> {
  const active = await findActiveHubSpotIntegrationByPortalId(portalId);

  if (active) {
    return active;
  }

  throw new AppError("FORBIDDEN", HUBSPOT_WEBHOOK_AUTH_ERROR, {
    expose: false,
  });
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

  const empty: HubSpotWebhookProcessSummary = {
    received: events.length,
    created: 0,
    updated: 0,
    duplicates: 0,
    skipped: 0,
    parked: 0,
    failed: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
  };

  if (events.length === 0) {
    return empty;
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

  await assertHubSpotAccessToken(credentials.accessToken);

  const collapsed = collapseHubSpotEventsByContact(events);
  empty.skipped += Math.max(0, events.length - collapsed.length);

  const syncEvents = collapsed.filter((event) => isHubSpotOngoingSyncEvent(event));
  const summary = await processOngoingHubSpotEvents({
    integration,
    events: syncEvents.map((event) => ({
      contactId: String(event.objectId),
      event,
    })),
    path: "webhook",
  });

  return {
    ...summary,
    received: events.length,
    skipped: summary.skipped + Math.max(0, events.length - collapsed.length),
  };
}

/** Exported for unit tests. */
export async function processHubSpotContactCreationEventForTests(
  integration: IntegrationRecord,
  event: HubSpotWebhookEvent,
) {
  const cursor = await ensureHubSpotSyncCursor({
    workspaceId: integration.workspaceId,
    integrationId: integration.id,
    portalId: integration.externalAccountId ?? "",
  });
  return processOngoingHubSpotContact({
    integration,
    contactId: String(event.objectId),
    event,
    path: "webhook",
    cursor,
    mutate: true,
    planOnly: false,
  });
}
