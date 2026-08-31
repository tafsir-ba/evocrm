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
}));

vi.mock("@/server/repositories/hubspot-sync-events", () => ({
  claimHubSpotSyncEvent: vi.fn(),
  findLatestHubSpotSyncEventForContact: vi.fn(),
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

vi.mock("@/server/services/integration-logs", () => ({
  writeIntegrationLog: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findIntegrations } from "@/server/repositories/integrations";
import { findActiveLeadByEmailNormalized, findLeadByHubSpotContactId } from "@/server/repositories/leads";
import {
  claimHubSpotSyncEvent,
  findLatestHubSpotSyncEventForContact,
  updateHubSpotSyncEvent,
} from "@/server/repositories/hubspot-sync-events";
import { ensureHubSpotSyncCursor } from "@/server/repositories/hubspot-sync-cursors";
import { listHubSpotProjectMappings } from "@/server/repositories/hubspot-project-mappings";
import { findProjectById, findProjects } from "@/server/repositories/projects";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { findMembershipsForLead } from "@/server/repositories/lead-project-memberships";
import {
  fetchHubSpotContact,
  fetchHubSpotContactProjectAssociationIds,
  searchHubSpotContactsModifiedSince,
} from "@/server/services/hubspot-client";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import { createLeadForWorkspace, updateLeadForWorkspace } from "@/server/services/leads";
import { applyPlannedMembershipsToLead } from "@/server/services/lead-project-memberships";
import {
  processOngoingHubSpotContact,
  processOngoingHubSpotEvents,
  reconcileHubSpotOngoingSync,
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
  lastWebhookOccurredAt: null,
  dryRunVerifiedAt: new Date("2026-08-30T00:00:00.000Z"),
  dryRunSummary: {},
  baselineContactCount: null,
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
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);
    vi.mocked(findLatestHubSpotSyncEventForContact).mockResolvedValue(null);
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
      contacts: [{ id: "99", properties: organicContact.properties }],
      nextAfter: null,
    });
    const { findHubSpotSyncCursor, updateHubSpotSyncCursor } = await import(
      "@/server/repositories/hubspot-sync-cursors"
    );
    vi.mocked(findHubSpotSyncCursor).mockResolvedValue(cursor);
    vi.mocked(updateHubSpotSyncCursor).mockResolvedValue(cursor);

    const summary = await reconcileHubSpotOngoingSync({ workspaceId: "ws-1", limit: 10 });
    expect(searchHubSpotContactsModifiedSince).toHaveBeenCalled();
    expect(createLeadForWorkspace).toHaveBeenCalled();
    expect(summary.created).toBe(1);
    expect(summary.integrations).toBe(1);
  });
});
