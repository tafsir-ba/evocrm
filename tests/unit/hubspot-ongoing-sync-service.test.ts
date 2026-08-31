import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrations: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({
    accessToken: "pat-test",
    clientSecret: "secret",
    portalId: "12345",
  })),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadByHubSpotContactId: vi.fn(),
  findActiveLeadByEmailNormalized: vi.fn(),
  listActiveLeadsByNormalizedEmail: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-sync-events", () => ({
  claimHubSpotSyncEvent: vi.fn(),
  findLatestHubSpotSyncEventForContact: vi.fn(),
  listRetryableHubSpotSyncEvents: vi.fn(),
  updateHubSpotSyncEvent: vi.fn(),
  countHubSpotSyncEvents: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-sync-cursors", () => ({
  ensureHubSpotSyncCursor: vi.fn(),
  findHubSpotSyncCursor: vi.fn(),
  updateHubSpotSyncCursor: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-project-mappings", () => ({
  listHubSpotProjectMappings: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
  findProjects: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  findMembershipsForLead: vi.fn(),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  assertHubSpotAccessToken: vi.fn(),
  fetchHubSpotContact: vi.fn(),
  fetchHubSpotContactProjectAssociationIds: vi.fn(),
  searchHubSpotContactsModifiedSince: vi.fn(),
  searchHubSpotContactsCreatedOrModifiedSince: vi.fn(),
}));

vi.mock("@/server/services/companies", () => ({
  resolveOrCreateCompanyByName: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
  updateLeadForWorkspace: vi.fn(),
  normalizeLeadEmail: vi.fn((email: string) => ({
    email,
    emailNormalized: email.toLowerCase(),
  })),
}));

vi.mock("@/server/services/lead-project-memberships", () => ({
  applyPlannedMembershipsToLead: vi.fn(),
}));

vi.mock("@/server/services/hubspot-notes-sync", () => ({
  processHubSpotNotesForContact: vi.fn().mockResolvedValue({
    received: 0,
    created: 0,
    duplicates: 0,
    skipped: 0,
    parked: 0,
    failed: 0,
    excluded: 0,
    wouldCreate: 0,
    contactsScanned: 0,
    searched: false,
  }),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findIntegrations } from "@/server/repositories/integrations";
import { listActiveLeadsByNormalizedEmail, findLeadByHubSpotContactId } from "@/server/repositories/leads";
import {
  claimHubSpotSyncEvent,
  findLatestHubSpotSyncEventForContact,
  listRetryableHubSpotSyncEvents,
  updateHubSpotSyncEvent,
} from "@/server/repositories/hubspot-sync-events";
import { ensureHubSpotSyncCursor, findHubSpotSyncCursor, updateHubSpotSyncCursor } from "@/server/repositories/hubspot-sync-cursors";
import { listHubSpotProjectMappings } from "@/server/repositories/hubspot-project-mappings";
import { findProjectById, findProjects } from "@/server/repositories/projects";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { findMembershipsForLead } from "@/server/repositories/lead-project-memberships";
import {
  fetchHubSpotContact,
  fetchHubSpotContactProjectAssociationIds,
  searchHubSpotContactsCreatedOrModifiedSince,
  searchHubSpotContactsModifiedSince,
} from "@/server/services/hubspot-client";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import { createLeadForWorkspace, updateLeadForWorkspace } from "@/server/services/leads";
import { applyPlannedMembershipsToLead } from "@/server/services/lead-project-memberships";
import {
  prepareHubSpotOngoingCutover,
  processOngoingHubSpotContact,
  processOngoingHubSpotEvents,
  reconcileHubSpotOngoingSync,
  runHubSpotOngoingCutoverDryRun,
} from "@/server/services/hubspot-ongoing-sync";

const integration = {
  id: "int-hs",
  workspaceId: "ws-1",
  type: "hubspot" as const,
  name: "HubSpot",
  status: "active" as const,
  credentialsEncrypted: "encrypted",
  externalAccountId: "12345",
  apiKeyHash: null,
  defaultProjectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  allowProjectOverride: false,
  createdBy: "bbbbbbbbbbbbbbbbbbbbbbbb",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const cursor = {
  id: "cursor-1",
  workspaceId: "ws-1",
  integrationId: "int-hs",
  portalId: "12345",
  status: "active" as const,
  cutoverAt: new Date("2026-08-01T00:00:00.000Z"),
  lastReconciledModifiedAt: null,
  lastReconciledAfter: null,
  lastReconciledContactId: null,
  lastWebhookOccurredAt: null,
  dryRunVerifiedAt: new Date("2026-08-30T00:00:00.000Z"),
  dryRunSummary: {},
  baselineContactCount: null,
  notesStatus: "pending_cutover" as const,
  notesDryRunVerifiedAt: null,
  notesDryRunSummary: {},
  lastNotesReconciledModifiedAt: null,
  lastNotesReconciledAfter: null,
  lastNotesReconciledContactId: null,
  sideEffectGuard: { triggerAutomation: false },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const organicContact = {
  id: "99",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+41000",
  createdAt: "2026-08-20T09:00:00.000Z",
  lastModifiedAt: "2026-08-20T10:00:00.000Z",
  properties: {
    wd_project: "leparcdescrets",
    hs_analytics_source: "ORGANIC_SEARCH",
    hs_object_source: "FORM",
    company: "Analytical Engines",
    jobtitle: "Analyst",
    industry: "Technology",
    state: "Geneva",
    product_intersted_in: "WD",
  },
};

function claimedEvent(overrides: Record<string, unknown> = {}) {
  return {
    record: {
      id: "evt-1",
      workspaceId: "ws-1",
      integrationId: "int-hs",
      eventKey: "hubspot:event:99",
      contactId: "99",
      subscriptionType: "contact.creation",
      hubspotEventId: "7",
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      lastModifiedAt: "2026-08-20T10:00:00.000Z",
      emailHash: "abc",
      status: "received",
      outcome: null,
      parkReason: null,
      errorCode: null,
      attemptCount: 0,
      leadId: null,
      payloadSummary: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
    created: true,
  };
}

describe("ongoing HubSpot sync service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE = "enabled";
    process.env.HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE = "true";
    process.env.HUBSPOT_ONGOING_SYNC_RECONCILE = "true";

    vi.mocked(findLeadByHubSpotContactId).mockResolvedValue(null);
    vi.mocked(listActiveLeadsByNormalizedEmail).mockResolvedValue([]);
    vi.mocked(findLatestHubSpotSyncEventForContact).mockResolvedValue(null);
    vi.mocked(listRetryableHubSpotSyncEvents).mockResolvedValue([]);
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue(claimedEvent() as never);
    vi.mocked(updateHubSpotSyncEvent).mockResolvedValue(null);
    vi.mocked(fetchHubSpotContact).mockResolvedValue(organicContact);
    vi.mocked(fetchHubSpotContactProjectAssociationIds).mockResolvedValue([]);
    vi.mocked(listHubSpotProjectMappings).mockResolvedValue([
      {
        id: "map-1",
        workspaceId: "ws-1",
        integrationId: "int-hs",
        hubspotProjectId: "leparcdescrets",
        hubspotProjectName: "Le Parc des Crêts",
        evoProjectId: "cccccccccccccccccccccccc",
        status: "mapped",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    vi.mocked(findProjects).mockResolvedValue([
      { id: "cccccccccccccccccccccccc", name: "Le Parc des Crêts", reference: "LPD" },
    ] as never);
    vi.mocked(findProjectById).mockResolvedValue({
      id: "cccccccccccccccccccccccc",
      archivedAt: null,
    } as never);
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(async (_ws, type, key) => {
      if (type === "lead_status" && key === "new") {
        return { id: "dddddddddddddddddddddddd", isActive: true } as never;
      }
      if (type === "lead_source") {
        return { id: `source-${key}`, isActive: true } as never;
      }
      return null;
    });
    vi.mocked(resolveOrCreateCompanyByName).mockResolvedValue({
      company: { id: "eeeeeeeeeeeeeeeeeeeeeeee", name: "Analytical Engines" },
      created: true,
    } as never);
    vi.mocked(createLeadForWorkspace).mockResolvedValue({
      lead: { id: "lead-new" },
      warnings: [],
    } as never);
    vi.mocked(updateLeadForWorkspace).mockResolvedValue({
      lead: { id: "lead-existing" },
      warnings: [],
    } as never);
    vi.mocked(findMembershipsForLead).mockResolvedValue([]);
    vi.mocked(ensureHubSpotSyncCursor).mockResolvedValue(cursor);
    vi.mocked(findHubSpotSyncCursor).mockResolvedValue(cursor);
    vi.mocked(updateHubSpotSyncCursor).mockResolvedValue(cursor);
    vi.mocked(findIntegrations).mockResolvedValue([integration] as never);
  });

  it("creates a genuine organic inbound lead and never enrolls campaigns", async () => {
    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      event: {
        objectId: 99,
        subscriptionType: "contact.creation",
        eventId: 7,
        occurredAt: Date.parse("2026-08-20T10:00:00.000Z"),
      },
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("created");
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      integration.createdBy,
      expect.objectContaining({
        projectId: "cccccccccccccccccccccccc",
        sourceId: "source-website",
        email: "ada@example.com",
        attributes: expect.objectContaining({
          integration: expect.objectContaining({
            inboundSource: "hubspot",
            acquisitionChannel: "organic_inbound",
            sourceCreatedAt: "2026-08-20T09:00:00.000Z",
            receivedAt: "2026-08-20T09:00:00.000Z",
            idempotencyKey: "hubspot:contact:99",
          }),
        }),
      }),
      expect.objectContaining({ triggerAutomation: false }),
    );
    expect(vi.mocked(createLeadForWorkspace).mock.calls[0][2].attributes?.campaignEnrollmentPolicy).toBeUndefined();
    expect(applyPlannedMembershipsToLead).toHaveBeenCalled();
  });

  it("treats duplicate event delivery as idempotent", async () => {
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue({
      ...claimedEvent({ status: "processed", leadId: "lead-new" }),
      created: false,
    } as never);

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      event: { objectId: 99, subscriptionType: "contact.creation", eventId: 7 },
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("duplicate");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("ignores out-of-order older events", async () => {
    vi.mocked(findLatestHubSpotSyncEventForContact).mockResolvedValue({
      occurredAt: new Date("2026-08-21T00:00:00.000Z"),
    } as never);

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      event: {
        objectId: 99,
        subscriptionType: "contact.propertyChange",
        occurredAt: Date.parse("2026-08-20T00:00:00.000Z"),
      },
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("skipped");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("updates an existing HubSpot lead instead of creating a duplicate", async () => {
    vi.mocked(findLeadByHubSpotContactId).mockResolvedValue({
      id: "lead-existing",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: null,
      industry: null,
      jobTitle: null,
      stateRegion: null,
      companyId: null,
      intelligenceProvenance: {},
      attributes: {
        integration: {
          inboundSource: "hubspot",
          idempotencyKey: "hubspot:contact:99",
          ownedFields: {
            phone: { method: "hubspot", source: "hubspot_ongoing_sync", appliedAt: "2026-08-20T00:00:00.000Z" },
          },
        },
      },
    } as never);

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      event: { objectId: 99, subscriptionType: "contact.propertyChange", occurredAt: Date.now() },
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("updated");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(updateLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "lead-existing",
      integration.createdBy,
      expect.objectContaining({
        phone: "+41000",
      }),
      expect.objectContaining({ triggerAutomation: false }),
    );
  });

  it("parks project conflicts and never writes EvoHome General", async () => {
    vi.mocked(fetchHubSpotContact).mockResolvedValue({
      ...organicContact,
      properties: { ...organicContact.properties, wd_project: "unknown-slug" },
    });

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("parked");
    expect(result.parkReason).toBe("unmapped_project");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("applies multi-project memberships with first joined primary", async () => {
    vi.mocked(listHubSpotProjectMappings).mockResolvedValue([
      {
        hubspotProjectId: "leparcdescrets",
        evoProjectId: "cccccccccccccccccccccccc",
        status: "mapped",
        hubspotProjectName: "LPD",
      },
      {
        hubspotProjectId: "arbora",
        evoProjectId: "ffffffffffffffffffffffff",
        status: "mapped",
        hubspotProjectName: "Arbora",
      },
    ] as never);
    vi.mocked(findProjects).mockResolvedValue([
      { id: "cccccccccccccccccccccccc", name: "LPD", reference: "LPD" },
      { id: "ffffffffffffffffffffffff", name: "Arbora", reference: "ARB" },
    ] as never);
    vi.mocked(fetchHubSpotContact).mockResolvedValue({
      ...organicContact,
      properties: { ...organicContact.properties, wd_project: "leparcdescrets; arbora" },
    });

    await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(applyPlannedMembershipsToLead).toHaveBeenCalledWith(
      expect.objectContaining({
        plans: [
          expect.objectContaining({ projectId: "cccccccccccccccccccccccc", isPrimary: true }),
          expect.objectContaining({ projectId: "ffffffffffffffffffffffff", isPrimary: false }),
        ],
      }),
    );
  });

  it("keeps non-organic HubSpot sources and campaign-guards them", async () => {
    vi.mocked(fetchHubSpotContact).mockResolvedValue({
      ...organicContact,
      properties: {
        ...organicContact.properties,
        hs_analytics_source: "EMAIL_MARKETING",
        hs_object_source: "EMAIL",
      },
    });

    await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      integration.createdBy,
      expect.objectContaining({
        sourceId: "source-hubspot",
        attributes: expect.objectContaining({
          integration: expect.objectContaining({
            acquisitionChannel: "hubspot_sourced",
          }),
          campaignEnrollmentPolicy: {
            defaultExcluded: true,
            source: "hubspot_legacy_migration",
          },
        }),
      }),
      expect.objectContaining({ triggerAutomation: false }),
    );
  });

  it("does not replay pre-cutover contacts as new acquisition", async () => {
    vi.mocked(fetchHubSpotContact).mockResolvedValue({
      ...organicContact,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result).toMatchObject({
      outcome: "parked",
      parkReason: "pre_cutover_not_imported",
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("skips CRM writes when the release gate is off (webhook loss safe default)", async () => {
    process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE = "off";
    const summary = await processOngoingHubSpotEvents({
      integration,
      events: [{ contactId: "99" }],
      path: "webhook",
    });
    expect(summary.skipped).toBe(1);
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("reconciliation searches HubSpot after the watermark without creating activities", async () => {
    vi.mocked(searchHubSpotContactsModifiedSince).mockResolvedValue({
      contacts: [{ ...organicContact, lastModifiedAt: "2026-08-20T10:00:00.000Z" }],
      nextAfter: null,
    });

    const summary = await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 10 });
    expect(searchHubSpotContactsModifiedSince).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiedAfterIso: cursor.cutoverAt.toISOString(),
        operator: "GTE",
        after: null,
      }),
    );
    expect(createLeadForWorkspace).toHaveBeenCalled();
    expect(summary.created).toBe(1);
    expect(summary.integrations).toBe(1);
    expect(updateHubSpotSyncCursor).toHaveBeenCalledWith(
      "ws-1",
      "int-hs",
      expect.objectContaining({
        lastReconciledModifiedAt: new Date("2026-08-20T10:00:00.000Z"),
        lastReconciledAfter: null,
        lastReconciledContactId: "99",
      }),
    );
  });

  it("matches email only inside the attributed project and never updates another project's lead", async () => {
    vi.mocked(listActiveLeadsByNormalizedEmail).mockResolvedValue([
      {
        id: "lead-other-project",
        projectId: "ffffffffffffffffffffffff",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    ] as never);

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result.outcome).toBe("created");
    expect(createLeadForWorkspace).toHaveBeenCalled();
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("parks when the same email has more than one lead in the destination project", async () => {
    vi.mocked(listActiveLeadsByNormalizedEmail).mockResolvedValue([
      {
        id: "lead-dest-1",
        projectId: "cccccccccccccccccccccccc",
        firstName: "Ada",
        lastName: "Lovelace",
      },
      {
        id: "lead-dest-2",
        projectId: "cccccccccccccccccccccccc",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    ] as never);

    const result = await processOngoingHubSpotContact({
      integration,
      contactId: "99",
      path: "webhook",
      cursor,
      mutate: true,
      planOnly: false,
    });

    expect(result).toMatchObject({
      outcome: "parked",
      parkReason: "email_ambiguous_in_project",
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the reconcile filter watermark while paging and only uses nextAfter on that result set", async () => {
    const filterAt = new Date("2026-08-01T00:00:00.000Z");
    vi.mocked(findHubSpotSyncCursor).mockResolvedValue({
      ...cursor,
      lastReconciledModifiedAt: filterAt,
      lastReconciledAfter: null,
    });
    vi.mocked(searchHubSpotContactsModifiedSince).mockResolvedValue({
      contacts: [{ ...organicContact, id: "99", lastModifiedAt: "2026-08-02T00:00:00.000Z" }],
      nextAfter: "page-2",
    });

    await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 1 });

    expect(searchHubSpotContactsModifiedSince).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiedAfterIso: filterAt.toISOString(),
        after: null,
        operator: "GTE",
      }),
    );
    expect(updateHubSpotSyncCursor).toHaveBeenCalledWith(
      "ws-1",
      "int-hs",
      expect.objectContaining({
        lastReconciledModifiedAt: filterAt,
        lastReconciledAfter: "page-2",
      }),
    );

    vi.mocked(findHubSpotSyncCursor).mockResolvedValue({
      ...cursor,
      lastReconciledModifiedAt: filterAt,
      lastReconciledAfter: "page-2",
    });
    vi.mocked(searchHubSpotContactsModifiedSince).mockResolvedValue({
      contacts: [
        {
          ...organicContact,
          id: "100",
          lastModifiedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      nextAfter: null,
    });
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue(claimedEvent({ contactId: "100", id: "evt-2" }) as never);

    await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 1 });

    expect(searchHubSpotContactsModifiedSince).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modifiedAfterIso: filterAt.toISOString(),
        after: "page-2",
        operator: "GTE",
      }),
    );
    expect(updateHubSpotSyncCursor).toHaveBeenLastCalledWith(
      "ws-1",
      "int-hs",
      expect.objectContaining({
        lastReconciledModifiedAt: new Date("2026-08-02T00:00:00.000Z"),
        lastReconciledAfter: null,
        lastReconciledContactId: "100",
      }),
    );
  });

  it("does not advance the reconcile cursor when a page fails and retries the failed contact", async () => {
    vi.mocked(searchHubSpotContactsModifiedSince).mockResolvedValue({
      contacts: [{ ...organicContact, lastModifiedAt: "2026-08-20T10:00:00.000Z" }],
      nextAfter: null,
    });
    vi.mocked(createLeadForWorkspace).mockRejectedValueOnce(new Error("db timeout"));

    const failed = await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 10 });
    expect(failed.failed).toBe(1);
    expect(updateHubSpotSyncCursor).not.toHaveBeenCalled();

    vi.mocked(listRetryableHubSpotSyncEvents).mockResolvedValue([
      { contactId: "99", status: "failed", attemptCount: 1 },
    ] as never);
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue({
      ...claimedEvent({ status: "failed", attemptCount: 1 }),
      created: false,
    } as never);

    const retried = await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 10 });
    expect(retried.created).toBe(1);
    expect(retried.failed).toBe(0);
    expect(createLeadForWorkspace).toHaveBeenCalled();
  });

  it("cutover dry-run searches post-watermark contacts and writes would_* ledger outcomes", async () => {
    process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE = "dry-run";
    vi.mocked(searchHubSpotContactsCreatedOrModifiedSince).mockResolvedValue({
      contacts: [organicContact],
      nextAfter: null,
    });
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue(claimedEvent({ id: "evt-dry" }) as never);

    const summary = await runHubSpotOngoingCutoverDryRun({
      integration,
      cursor: { ...cursor, status: "pending_cutover", dryRunVerifiedAt: null },
    });

    expect(searchHubSpotContactsCreatedOrModifiedSince).toHaveBeenCalledWith(
      expect.objectContaining({
        sinceIso: cursor.cutoverAt.toISOString(),
      }),
    );
    expect(summary).toMatchObject({
      searched: true,
      received: 1,
      wouldCreate: 1,
      created: 0,
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(updateHubSpotSyncEvent).toHaveBeenCalledWith(
      "ws-1",
      "evt-dry",
      expect.objectContaining({ outcome: "would_create" }),
    );
  });

  it("rejects a zero-contact cutover dry-run and will not verify it", async () => {
    process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE = "dry-run";
    vi.mocked(searchHubSpotContactsCreatedOrModifiedSince).mockResolvedValue({
      contacts: [],
      nextAfter: null,
    });

    await expect(
      runHubSpotOngoingCutoverDryRun({
        integration,
        cursor: { ...cursor, status: "pending_cutover", dryRunVerifiedAt: null },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("zero post-watermark") });

    vi.mocked(ensureHubSpotSyncCursor).mockResolvedValue({
      ...cursor,
      dryRunSummary: { received: 0, searched: true },
      dryRunVerifiedAt: null,
    });

    await expect(
      prepareHubSpotOngoingCutover({
        workspaceId: "ws-1",
        integrationId: "int-hs",
        portalId: "12345",
        verifyDryRun: true,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("zero HubSpot contacts") });
  });
});
