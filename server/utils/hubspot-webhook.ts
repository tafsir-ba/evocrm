import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { AppError } from "@/server/errors";

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/**
 * Verify HubSpot webhook signature v3.
 * @see https://developers.hubspot.com/docs/api/webhooks/validating-requests
 */
export function verifyHubSpotSignatureV3(input: {
  method: string;
  uri: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  clientSecret: string;
  now?: number;
}): void {
  const { method, uri, rawBody, timestampHeader, signatureHeader, clientSecret } = input;

  if (!timestampHeader || !signatureHeader) {
    throw new AppError("FORBIDDEN", "Invalid HubSpot webhook signature.", {
      expose: false,
    });
  }

  const timestamp = Number.parseInt(timestampHeader, 10);

  if (!Number.isFinite(timestamp)) {
    throw new AppError("FORBIDDEN", "Invalid HubSpot webhook signature.", {
      expose: false,
    });
  }

  const now = input.now ?? Date.now();

  if (Math.abs(now - timestamp) > MAX_TIMESTAMP_SKEW_MS) {
    // Opaque message — do not distinguish skew from other signature failures.
    throw new AppError("FORBIDDEN", "Invalid HubSpot webhook signature.", {
      expose: false,
    });
  }

  const source = `${method}${uri}${rawBody}${timestampHeader}`;
  const expected = createHmac("sha256", clientSecret).update(source, "utf8").digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new AppError("FORBIDDEN", "Invalid HubSpot webhook signature.", {
      expose: false,
    });
  }
}

export type HubSpotWebhookEvent = {
  objectId: number | string;
  subscriptionType?: string;
  portalId?: number | string;
  eventId?: number | string;
  occurredAt?: number;
  attemptNumber?: number;
  propertyName?: string;
  propertyValue?: string;
};

export function parseHubSpotWebhookEvents(payload: unknown): HubSpotWebhookEvent[] {
  if (!Array.isArray(payload)) {
    throw new AppError("VALIDATION_ERROR", "HubSpot webhook payload must be an array.");
  }

  return payload.filter((item): item is HubSpotWebhookEvent => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const event = item as HubSpotWebhookEvent;
    return event.objectId !== undefined && event.objectId !== null;
  });
}

export function isHubSpotContactCreationEvent(event: HubSpotWebhookEvent): boolean {
  return event.subscriptionType === "contact.creation";
}

export function isHubSpotContactPropertyChangeEvent(event: HubSpotWebhookEvent): boolean {
  return event.subscriptionType === "contact.propertyChange";
}

/** Creation and property-change events participate in the ongoing upsert sync. */
export function isHubSpotOngoingSyncEvent(event: HubSpotWebhookEvent): boolean {
  return isHubSpotContactCreationEvent(event) || isHubSpotContactPropertyChangeEvent(event);
}

export function collapseHubSpotEventsByContact(
  events: HubSpotWebhookEvent[],
): HubSpotWebhookEvent[] {
  const latest = new Map<string, HubSpotWebhookEvent>();
  for (const event of events) {
    if (!isHubSpotOngoingSyncEvent(event)) {
      continue;
    }
    const contactId = String(event.objectId);
    const current = latest.get(contactId);
    if (!current) {
      latest.set(contactId, event);
      continue;
    }
    const currentAt = Number(current.occurredAt ?? 0);
    const nextAt = Number(event.occurredAt ?? 0);
    if (nextAt >= currentAt) {
      latest.set(contactId, event);
    }
  }
  return [...latest.values()];
}
