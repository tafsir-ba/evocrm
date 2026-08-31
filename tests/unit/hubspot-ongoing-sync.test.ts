import { describe, expect, it } from "vitest";

import {
  campaignAttributesForHubSpotSync,
  classifyHubSpotLeadSource,
  envFlagEnabled,
  evaluateHubSpotCutoverWatermark,
  evaluateHubSpotSyncMutationGate,
  hashNormalizedEmailForKey,
  hubspotOngoingContactIdempotencyKey,
  hubspotSyncEventKey,
  isStaleHubSpotEvent,
  mergeLeadAttributesForHubSpotSync,
  parseHubSpotOngoingSyncReleaseGate,
  planHubSpotIdentityWrites,
  resolveHubSpotInboundDates,
  HUBSPOT_SOURCED_CHANNEL,
  ORGANIC_INBOUND_CHANNEL,
} from "@/lib/hubspot-ongoing-sync";

describe("ongoing HubSpot sync gates", () => {
  it("defaults the release gate to off and never mutates until verified", () => {
    expect(parseHubSpotOngoingSyncReleaseGate(undefined)).toBe("off");
    expect(envFlagEnabled(undefined)).toBe(false);
    expect(
      evaluateHubSpotSyncMutationGate({
        path: "webhook",
      }),
    ).toMatchObject({ mutate: false, reason: "release_gate_off" });

    expect(
      evaluateHubSpotSyncMutationGate({
        releaseGate: "enabled",
        webhookMutate: "true",
        path: "webhook",
        cursorStatus: "pending_cutover",
      }),
    ).toMatchObject({ mutate: false, plan: true, reason: "cursor_not_active" });

    expect(
      evaluateHubSpotSyncMutationGate({
        releaseGate: "enabled",
        webhookMutate: "true",
        path: "webhook",
        cursorStatus: "active",
      }),
    ).toMatchObject({ mutate: false, reason: "dry_run_not_verified" });

    expect(
      evaluateHubSpotSyncMutationGate({
        releaseGate: "enabled",
        webhookMutate: "true",
        path: "webhook",
        cursorStatus: "active",
        dryRunVerifiedAt: "2026-08-31T00:00:00.000Z",
      }),
    ).toMatchObject({ mutate: true, reason: "mutate_allowed" });
  });
});

describe("idempotency keys", () => {
  it("keys events by contact id, version timestamp, and hashed email", () => {
    const first = hubspotSyncEventKey({
      contactId: "99",
      occurredAt: 1_700_000_000_000,
      subscriptionType: "contact.creation",
      eventId: 7,
      emailNormalized: "ada@example.com",
    });
    const retry = hubspotSyncEventKey({
      contactId: "99",
      occurredAt: 1_700_000_000_000,
      subscriptionType: "contact.creation",
      eventId: 7,
      emailNormalized: "ada@example.com",
    });
    const otherEmail = hubspotSyncEventKey({
      contactId: "99",
      occurredAt: 1_700_000_000_000,
      subscriptionType: "contact.creation",
      eventId: 7,
      emailNormalized: "other@example.com",
    });

    expect(first).toBe(retry);
    expect(first).toContain("hubspot:event:99:1700000000000:contact.creation:7:");
    expect(first).not.toContain("ada@");
    expect(otherEmail).not.toBe(first);
    expect(hubspotOngoingContactIdempotencyKey("99")).toBe("hubspot:contact:99");
    expect(hashNormalizedEmailForKey("Ada@Example.com")).toBe(
      hashNormalizedEmailForKey("ada@example.com"),
    );
  });

  it("treats older versions as stale so out-of-order events do not rewind", () => {
    expect(
      isStaleHubSpotEvent({
        incomingOccurredAt: "2026-08-01T00:00:00.000Z",
        lastProcessedOccurredAt: "2026-08-10T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isStaleHubSpotEvent({
        incomingOccurredAt: "2026-08-11T00:00:00.000Z",
        lastProcessedOccurredAt: "2026-08-10T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("source classification and dates", () => {
  it("marks genuine website inbound organic with original createdate, not sync time", () => {
    const classified = classifyHubSpotLeadSource({
      analyticsSource: "ORGANIC_SEARCH",
      objectSource: "FORM",
    });
    expect(classified).toMatchObject({
      organic: true,
      acquisitionChannel: ORGANIC_INBOUND_CHANNEL,
      leadSourceKey: "website",
    });

    const dates = resolveHubSpotInboundDates({
      sourceCreatedAt: "2026-08-20T09:00:00.000Z",
      syncNow: new Date("2026-08-31T12:00:00.000Z"),
      organic: true,
      newAcquisition: true,
    });
    expect(dates.receivedAt).toBe("2026-08-20T09:00:00.000Z");
    expect(dates.sourceCreatedAt).toBe("2026-08-20T09:00:00.000Z");
    expect(dates.lastSyncedAt).toBe("2026-08-31T12:00:00.000Z");
    expect(campaignAttributesForHubSpotSync({ organic: true, newAcquisition: true })).toEqual({});
  });

  it("does not label paid, email, or import contacts as organic", () => {
    expect(
      classifyHubSpotLeadSource({ analyticsSource: "PAID_SEARCH" }),
    ).toMatchObject({
      organic: false,
      acquisitionChannel: HUBSPOT_SOURCED_CHANNEL,
      leadSourceKey: "google_ads",
    });
    expect(
      classifyHubSpotLeadSource({ analyticsSource: "EMAIL_MARKETING" }),
    ).toMatchObject({
      organic: false,
      leadSourceKey: "hubspot",
    });
    expect(
      classifyHubSpotLeadSource({
        analyticsSource: "ORGANIC_SEARCH",
        objectSource: "IMPORT",
      }),
    ).toMatchObject({ organic: false });
    expect(
      campaignAttributesForHubSpotSync({ organic: false, newAcquisition: true }),
    ).toEqual({
      campaignEnrollmentPolicy: {
        defaultExcluded: true,
        source: "hubspot_legacy_migration",
      },
    });
  });

  it("parks pre-cutover contacts as not-new and allows updates only when already imported", () => {
    expect(
      evaluateHubSpotCutoverWatermark({
        sourceCreatedAt: "2024-01-01T00:00:00.000Z",
        cutoverAt: "2026-08-31T00:00:00.000Z",
        existingLead: false,
      }),
    ).toEqual({ kind: "park", reason: "pre_cutover_not_imported" });

    expect(
      evaluateHubSpotCutoverWatermark({
        sourceCreatedAt: "2024-01-01T00:00:00.000Z",
        cutoverAt: "2026-08-31T00:00:00.000Z",
        existingLead: true,
      }),
    ).toEqual({ kind: "existing_update_only" });

    expect(
      evaluateHubSpotCutoverWatermark({
        sourceCreatedAt: "2026-08-31T12:00:00.000Z",
        cutoverAt: "2026-08-31T00:00:00.000Z",
        existingLead: false,
      }),
    ).toEqual({ kind: "new_acquisition" });
  });
});

describe("non-destructive identity updates", () => {
  it("fills blanks and HubSpot-owned fields, preserving manual values", () => {
    const planned = planHubSpotIdentityWrites({
      existing: {
        firstName: "Ada",
        lastName: null,
        email: "ada@example.com",
        phone: null,
      },
      incoming: {
        firstName: "Ada Byron",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+410000",
      },
      ownedFields: {
        firstName: {
          method: "manual",
          source: "lead_update",
          appliedAt: "2026-08-01T00:00:00.000Z",
        },
      },
      appliedAt: "2026-08-31T00:00:00.000Z",
    });

    expect(planned.applied).toEqual(["lastName", "phone"]);
    expect(planned.values).toEqual({ lastName: "Lovelace", phone: "+410000" });
    expect(planned.skipped).toEqual(
      expect.arrayContaining([
        { field: "firstName", reason: "skip_preserved" },
        { field: "email", reason: "skip_preserved" },
      ]),
    );
  });

  it("merges HubSpot provenance without dropping unrelated attributes", () => {
    const merged = mergeLeadAttributesForHubSpotSync({
      existing: {
        campaignEnrollmentPolicy: { defaultExcluded: true, source: "hubspot_legacy_migration" },
        other: "keep",
        integration: { inboundSource: "hubspot-wd-project", externalId: "99" },
      },
      integrationPatch: {
        lastSyncedAt: "2026-08-31T00:00:00.000Z",
        lastOccurredAt: "2026-08-30T00:00:00.000Z",
      },
    });

    expect(merged.other).toBe("keep");
    expect(merged.integration).toMatchObject({
      inboundSource: "hubspot-wd-project",
      externalId: "99",
      lastSyncedAt: "2026-08-31T00:00:00.000Z",
    });
  });
});
