import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/workspaces", () => ({
  findAllWorkspaces: vi.fn(),
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrations: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadsWithHubSpotContactIdempotency: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  fetchHubSpotContactsByIds: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  updateLeadForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/companies", () => ({
  findCompanyByNameForWorkspace: vi.fn(),
  resolveOrCreateCompanyByName: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({ accessToken: "pat-test" })),
}));

import { findIntegrations } from "@/server/repositories/integrations";
import { findLeadsWithHubSpotContactIdempotency } from "@/server/repositories/leads";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { findCompanyByNameForWorkspace } from "@/server/services/companies";
import { fetchHubSpotContactsByIds } from "@/server/services/hubspot-client";
import { runHubSpotCmpLeadIntelligenceEnrichment } from "@/server/services/hubspot-cmp-lead-intelligence";
import { updateLeadForWorkspace } from "@/server/services/leads";
import { leadRecordExtras } from "@/tests/helpers/crm-fixtures";

const lead = {
  id: "lead-1",
  workspaceId: "ws-1",
  ...leadRecordExtras,
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  emailNormalized: "ada@example.com",
  phone: null,
  phoneNormalized: null,
  statusId: "status-1",
  sourceId: null,
  ownerId: null,
  assignedTo: null,
  language: null,
  preferredContactMethod: null,
  budgetMin: null,
  budgetMax: null,
  preferredAreas: [],
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
  notes: null,
  tags: [],
  attributes: {
    integration: {
      inboundSource: "hubspot",
      idempotencyKey: "hubspot:contact:99",
      externalId: "99",
    },
  },
  emailConsentStatus: "unknown",
  emailUnsubscribedAt: null,
  emailUnsubscribeReason: null,
  lastContactedAt: null,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("HubSpot CMP lead intelligence enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceById).mockResolvedValue({ id: "ws-1" } as never);
    vi.mocked(findIntegrations).mockResolvedValue([
      {
        id: "int-hs",
        credentialsEncrypted: "encrypted",
        createdBy: "user-1",
      } as never,
    ]);
    vi.mocked(findLeadsWithHubSpotContactIdempotency).mockResolvedValue([lead] as never);
    vi.mocked(findCompanyByNameForWorkspace).mockResolvedValue(null);
    vi.mocked(fetchHubSpotContactsByIds).mockResolvedValue([
      {
        id: "99",
        properties: {
          industry: "Finance",
          jobtitle: "Analyst",
          state: "Geneva",
          company: "Analytical Engines",
          product_intersted_in: "CMP",
        },
      },
    ]);
    vi.mocked(updateLeadForWorkspace).mockResolvedValue({
      lead: { id: "lead-1" },
      warnings: [],
    } as never);
  });

  it("dry-runs CMP fills without writing or enrolling", async () => {
    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
    });

    expect(report.persisted).toBe(false);
    expect(report.eligible).toBe(1);
    expect(report.applied).toBe(1);
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("writes blank CMP fields with the no-enrollment guard", async () => {
    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.persisted).toBe(true);
    expect(updateLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "lead-1",
      "user-1",
      expect.objectContaining({
        industry: "Finance",
        jobTitle: "Analyst",
        stateRegion: "Geneva",
      }),
      expect.objectContaining({
        triggerAutomation: false,
        enrollCampaigns: false,
        enrollDrips: false,
        intelligenceMethod: "hubspot",
      }),
    );
  });

  it("does not overwrite a manual industry on execute", async () => {
    vi.mocked(findLeadsWithHubSpotContactIdempotency).mockResolvedValue([
      {
        ...lead,
        industry: "Private banking",
        intelligenceProvenance: {
          industry: {
            method: "manual",
            source: "lead_update",
            appliedAt: "2026-08-01T00:00:00.000Z",
            notes: null,
          },
        },
      },
    ] as never);

    await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(updateLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "lead-1",
      "user-1",
      expect.not.objectContaining({ industry: "Finance" }),
      expect.objectContaining({ triggerAutomation: false }),
    );
  });

  it("skips non-CMP HubSpot contacts", async () => {
    vi.mocked(fetchHubSpotContactsByIds).mockResolvedValue([
      {
        id: "99",
        properties: {
          industry: "Finance",
          product_intersted_in: "WD",
        },
      },
    ]);

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.notCmp).toBe(1);
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });
});
