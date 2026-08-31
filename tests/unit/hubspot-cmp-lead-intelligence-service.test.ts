import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/workspaces", () => ({
  findAllWorkspaces: vi.fn(),
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrations: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadsByProjectId: vi.fn(),
  findLeadsByIds: vi.fn(),
}));

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  findLeadIdsForProjectMembership: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  fetchHubSpotContactsByIds: vi.fn(),
  searchHubSpotContactsByEmail: vi.fn(),
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
import { findActiveLeadsByProjectId, findLeadsByIds } from "@/server/repositories/leads";
import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { findCompanyByNameForWorkspace, resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  fetchHubSpotContactsByIds,
  searchHubSpotContactsByEmail,
} from "@/server/services/hubspot-client";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";
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
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    vi.mocked(decodeHubSpotCredentials).mockReturnValue({
      accessToken: "pat-test",
      clientSecret: null,
      portalId: "12345",
    });
    vi.mocked(findWorkspaceById).mockResolvedValue({ id: "ws-1" } as never);
    vi.mocked(findIntegrations).mockResolvedValue([
      {
        id: "int-hs",
        credentialsEncrypted: "encrypted",
        createdBy: "user-1",
      } as never,
    ]);
    vi.mocked(findActiveLeadsByProjectId).mockResolvedValue([lead] as never);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue(["lead-1"]);
    vi.mocked(findLeadsByIds).mockResolvedValue([]);
    vi.mocked(findCompanyByNameForWorkspace).mockResolvedValue(null);
    vi.mocked(resolveOrCreateCompanyByName).mockResolvedValue({
      company: { id: "co-new" },
      created: true,
    } as never);
    vi.mocked(searchHubSpotContactsByEmail).mockResolvedValue([]);
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

  it("dry-runs CMP membership fills without writing or enrolling", async () => {
    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
    });

    expect(report.persisted).toBe(false);
    expect(report.cmpLeadsScanned).toBe(1);
    expect(report.hubspotMatches).toBe(1);
    expect(report.wouldChangeRecords).toBe(1);
    expect(report.valuesAvailable).toMatchObject({
      industry: 1,
      jobTitle: 1,
      stateRegion: 1,
      companyId: 1,
    });
    expect(report.enrollCampaigns).toBe(false);
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
    expect(searchHubSpotContactsByEmail).not.toHaveBeenCalled();
  });

  it("writes blank CMP fields with the no-enrollment guard and only intelligence keys", async () => {
    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.persisted).toBe(true);
    expect(report.filledRecords).toBe(1);
    expect(report.filledFields.industry).toBe(1);
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
        mutateLeadProject: false,
        mutateLeadStatus: false,
        mutateConsent: false,
        intelligenceMethod: "hubspot",
      }),
    );
    const patch = vi.mocked(updateLeadForWorkspace).mock.calls[0][3] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      ["companyId", "industry", "jobTitle", "stateRegion"].sort(),
    );
  });

  it("does not overwrite a manual industry on execute", async () => {
    vi.mocked(findActiveLeadsByProjectId).mockResolvedValue([
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

  it("still enriches CMP-membership leads when HubSpot product is not CMP", async () => {
    vi.mocked(fetchHubSpotContactsByIds).mockResolvedValue([
      {
        id: "99",
        properties: {
          industry: "Finance",
          jobtitle: "Analyst",
          product_intersted_in: "WD",
        },
      },
    ]);

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.filledRecords).toBe(1);
    expect(updateLeadForWorkspace).toHaveBeenCalled();
  });

  it("falls back to a unique HubSpot email match when contact id is missing", async () => {
    vi.mocked(findActiveLeadsByProjectId).mockResolvedValue([
      {
        ...lead,
        attributes: {},
      },
    ] as never);
    vi.mocked(searchHubSpotContactsByEmail).mockResolvedValue([
      {
        id: "88",
        email: "ada@example.com",
        properties: {
          industry: "Finance",
          jobtitle: "Analyst",
        },
      },
    ] as never);

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
    });

    expect(report.hubspotMatches).toBe(1);
    expect(report.rows[0]?.matchMethod).toBe("unique_email");
    expect(searchHubSpotContactsByEmail).toHaveBeenCalled();
  });

  it("parks an ambiguous email fallback and does not write", async () => {
    vi.mocked(findActiveLeadsByProjectId).mockResolvedValue([
      {
        ...lead,
        attributes: {},
      },
    ] as never);
    vi.mocked(searchHubSpotContactsByEmail).mockResolvedValue([
      { id: "88", properties: {} },
      { id: "89", properties: {} },
    ] as never);

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.unmatchedAmbiguousEmail).toBe(1);
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("is idempotent when HubSpot-owned values already match", async () => {
    vi.mocked(findCompanyByNameForWorkspace).mockResolvedValue({ id: "co-1" } as never);
    vi.mocked(findActiveLeadsByProjectId).mockResolvedValue([
      {
        ...lead,
        industry: "Finance",
        jobTitle: "Analyst",
        stateRegion: "Geneva",
        companyId: "co-1",
        intelligenceProvenance: {
          industry: {
            method: "hubspot",
            source: "hubspot_cmp_enrichment",
            appliedAt: "2026-08-01T00:00:00.000Z",
            notes: null,
          },
          jobTitle: {
            method: "hubspot",
            source: "hubspot_cmp_enrichment",
            appliedAt: "2026-08-01T00:00:00.000Z",
            notes: null,
          },
          stateRegion: {
            method: "hubspot",
            source: "hubspot_cmp_enrichment",
            appliedAt: "2026-08-01T00:00:00.000Z",
            notes: null,
          },
          companyId: {
            method: "hubspot",
            source: "hubspot_cmp_enrichment",
            appliedAt: "2026-08-01T00:00:00.000Z",
            notes: null,
          },
        },
      },
    ] as never);

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
      execute: true,
      confirmWrite: true,
    });

    expect(report.wouldChangeRecords).toBe(0);
    expect(report.skippedUnchanged).toBeGreaterThan(0);
    expect(updateLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("falls back to HUBSPOT_ACCESS_TOKEN when vault decrypt fails", async () => {
    vi.mocked(decodeHubSpotCredentials).mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-from-env";

    const report = await runHubSpotCmpLeadIntelligenceEnrichment({
      workspaceId: "ws-1",
    });

    expect(report.hubspotMatches).toBe(1);
    expect(fetchHubSpotContactsByIds).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "pat-from-env" }),
    );
  });
});
