import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/leads", () => ({
  findLeadByHubSpotContactId: vi.fn(),
  findLeadsWithHubSpotContactIdempotency: vi.fn(),
  listActiveLeadsByNormalizedEmail: vi.fn(),
}));

vi.mock("@/server/repositories/activities", () => ({
  createActivity: vi.fn(),
  findActivityByHubSpotExternalId: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-sync-events", () => ({
  claimHubSpotSyncEvent: vi.fn(),
  updateHubSpotSyncEvent: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-sync-cursors", () => ({
  ensureHubSpotSyncCursor: vi.fn(),
  findHubSpotSyncCursor: vi.fn(),
  updateHubSpotSyncCursor: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrations: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({ accessToken: "pat-test", portalId: "12345" })),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  assertHubSpotAccessToken: vi.fn(),
  fetchHubSpotContact: vi.fn(),
  fetchHubSpotNoteContactIds: vi.fn(),
  listHubSpotContactTimelineItems: vi.fn(),
  searchHubSpotNoteObjectsModifiedSince: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  normalizeLeadEmail: vi.fn((email: string) => ({
    email,
    emailNormalized: email.toLowerCase(),
  })),
  createLeadForWorkspace: vi.fn(),
  updateLeadForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/integration-logs", () => ({
  writeIntegrationLog: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findLeadByHubSpotContactId, listActiveLeadsByNormalizedEmail } from "@/server/repositories/leads";
import { createActivity, findActivityByHubSpotExternalId } from "@/server/repositories/activities";
import { claimHubSpotSyncEvent, updateHubSpotSyncEvent } from "@/server/repositories/hubspot-sync-events";
import { ensureHubSpotSyncCursor } from "@/server/repositories/hubspot-sync-cursors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { listHubSpotContactTimelineItems } from "@/server/services/hubspot-client";
import { createLeadForWorkspace, updateLeadForWorkspace } from "@/server/services/leads";
import { processHubSpotNotesForContact } from "@/server/services/hubspot-notes-sync";

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
  dryRunVerifiedAt: new Date(),
  dryRunSummary: {},
  baselineContactCount: null,
  notesStatus: "active" as const,
  notesDryRunVerifiedAt: new Date("2026-08-30T00:00:00.000Z"),
  notesDryRunSummary: { searched: true, contactsScanned: 1 },
  lastNotesReconciledModifiedAt: null,
  lastNotesReconciledAfter: null,
  lastNotesReconciledContactId: null,
  sideEffectGuard: { triggerAutomation: false },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const lead = {
  id: "lead-1",
  projectId: "cccccccccccccccccccccccc",
  email: "ada@example.com",
  attributes: { integration: { externalId: "99", idempotencyKey: "hubspot:contact:99" } },
};

describe("HubSpot notes sync service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HUBSPOT_NOTES_SYNC_RELEASE_GATE = "enabled";
    process.env.HUBSPOT_NOTES_SYNC_INCREMENTAL = "true";
    process.env.HUBSPOT_NOTES_SYNC_BACKFILL = "true";
    vi.mocked(ensureHubSpotSyncCursor).mockResolvedValue(cursor as never);
    vi.mocked(findLeadByHubSpotContactId).mockResolvedValue(lead as never);
    vi.mocked(listActiveLeadsByNormalizedEmail).mockResolvedValue([]);
    vi.mocked(findActivityByHubSpotExternalId).mockResolvedValue(null);
    vi.mocked(claimHubSpotSyncEvent).mockResolvedValue({
      created: true,
      record: {
        id: "evt-note",
        status: "received",
        attemptCount: 0,
        leadId: null,
      },
    } as never);
    vi.mocked(updateHubSpotSyncEvent).mockResolvedValue(null);
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(async (_ws, type, key) => {
      if (type === "activity_type") {
        return { id: `type-${key}`, isActive: true } as never;
      }
      if (type === "activity_status" && key === "completed") {
        return { id: "status-completed", isActive: true } as never;
      }
      return null;
    });
    vi.mocked(createActivity).mockResolvedValue({ id: "act-1" } as never);
    vi.mocked(listHubSpotContactTimelineItems).mockResolvedValue([
      {
        externalActivityId: "note:1",
        kind: "note",
        contactId: "99",
        occurredAt: "2026-08-20T09:00:00.000Z",
        lastModifiedAt: "2026-08-20T09:00:00.000Z",
        sourceLabel: "HubSpot note",
        formLabel: null,
        subject: null,
        bodyHtml: "Interested in a visit",
        bodyText: "Interested in a visit",
        direction: null,
        objectSource: "CRM_UI",
        fromEmail: null,
      },
    ]);
  });

  it("creates a completed timeline note with original timestamp and does not mutate the lead", async () => {
    const summary = await processHubSpotNotesForContact({
      integration,
      contactId: "99",
      path: "incremental",
      email: "ada@example.com",
      cursor: cursor as never,
    });

    expect(summary.created).toBe(1);
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        projectId: "cccccccccccccccccccccccc",
        title: "HubSpot note",
        hubspotExternalActivityId: "note:1",
        assignedTo: null,
        dueDate: null,
        createdAt: new Date("2026-08-20T09:00:00.000Z"),
        completedAt: new Date("2026-08-20T09:00:00.000Z"),
        attributes: expect.objectContaining({
          integration: expect.objectContaining({
            externalActivityId: "note:1",
            sourceOccurredAt: "2026-08-20T09:00:00.000Z",
          }),
        }),
      }),
    );
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("is replay-safe and does not duplicate a note for multi-project membership", async () => {
    vi.mocked(findActivityByHubSpotExternalId).mockResolvedValue({ id: "act-existing" } as never);
    const summary = await processHubSpotNotesForContact({
      integration,
      contactId: "99",
      path: "incremental",
      cursor: cursor as never,
    });
    expect(summary.duplicates).toBe(1);
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("parks when the same email maps to more than one lead and no HubSpot contact id match exists", async () => {
    vi.mocked(findLeadByHubSpotContactId).mockResolvedValue(null);
    vi.mocked(listActiveLeadsByNormalizedEmail).mockResolvedValue([
      { id: "lead-a", projectId: "proj-a" },
      { id: "lead-b", projectId: "proj-b" },
    ] as never);

    const summary = await processHubSpotNotesForContact({
      integration,
      contactId: "99",
      path: "incremental",
      email: "ada@example.com",
      cursor: cursor as never,
    });

    expect(summary.parked).toBe(1);
    expect(createActivity).not.toHaveBeenCalled();
    expect(listHubSpotContactTimelineItems).not.toHaveBeenCalled();
  });

  it("dry-run writes would_create ledger rows without creating activities", async () => {
    process.env.HUBSPOT_NOTES_SYNC_RELEASE_GATE = "dry-run";
    const summary = await processHubSpotNotesForContact({
      integration,
      contactId: "99",
      path: "dry-run",
      cursor: { ...cursor, notesStatus: "pending_cutover", notesDryRunVerifiedAt: null } as never,
    });
    expect(summary.wouldCreate).toBe(1);
    expect(summary.created).toBe(0);
    expect(createActivity).not.toHaveBeenCalled();
    expect(updateHubSpotSyncEvent).toHaveBeenCalledWith(
      "ws-1",
      "evt-note",
      expect.objectContaining({ outcome: "would_create" }),
    );
  });
});
