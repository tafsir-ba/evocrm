import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/lead-enrichment", () => ({
  createEnrichmentRun: vi.fn(),
  findEnrichmentRunById: vi.fn(),
  listEnrichmentRunsForLead: vi.fn(),
  newSuggestionId: vi.fn(() => "sug-1"),
  revokeEnrichmentRunsForLead: vi.fn(),
  updateEnrichmentRun: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/companies", () => ({
  findCompaniesByIds: vi.fn(),
}));

vi.mock("@/server/services/companies", () => ({
  resolveOrCreateCompanyByName: vi.fn(),
}));

vi.mock("@/server/services/roles", () => ({
  syncSystemRolePermissionsForWorkspace: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  getEnv: () => ({
    OPENAI_API_KEY: undefined,
    TAVILY_API_KEY: undefined,
    BRAVE_SEARCH_API_KEY: undefined,
    LEAD_ENRICHMENT_DEMO: undefined,
    OPENAI_ENRICHMENT_MODEL: undefined,
  }),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import { findCompaniesByIds } from "@/server/repositories/companies";
import {
  createEnrichmentRun,
  findEnrichmentRunById,
  updateEnrichmentRun,
} from "@/server/repositories/lead-enrichment";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  applyLeadEnrichmentDecisions,
  startLeadEnrichment,
} from "@/server/services/lead-enrichment";
import { buildTestLeadRecord } from "@/tests/helpers/crm-fixtures";
import { DEMO_AMBIGUOUS_EMAIL, DEMO_UNIQUE_EMAIL } from "@/tests/fixtures/lead-enrichment-demo";

const workspace = {
  id: "ws-1",
  leadEnrichment: {
    enabled: true,
    demoMode: true,
    retentionDays: 180,
    legalReviewAcknowledgedAt: new Date(),
    legalReviewAcknowledgedBy: "user-1",
  },
};

describe("lead enrichment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceById).mockResolvedValue(workspace as never);
    vi.mocked(findCompaniesByIds).mockResolvedValue([]);
    vi.mocked(createEnrichmentRun).mockImplementation(async (input) => ({
      id: "run-1",
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      initiatedBy: input.initiatedBy,
      status: "searching",
      queryFullName: input.queryFullName,
      queryEmail: input.queryEmail,
      allowedSources: input.allowedSources,
      searchProvider: null,
      aiModel: null,
      retrievedAt: null,
      expiresAt: null,
      identityMatch: null,
      identityRationale: null,
      failureMessage: null,
      demoMode: true,
      sources: [],
      suggestions: [],
      summaryDraft: null,
      acceptedSummary: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    vi.mocked(updateEnrichmentRun).mockImplementation(async (_ws, id, patch) => ({
      id,
      workspaceId: "ws-1",
      leadId: "lead-1",
      initiatedBy: "user-1",
      status: (patch.status as never) ?? "reviewing",
      queryFullName: "Amira Keller",
      queryEmail: DEMO_UNIQUE_EMAIL,
      allowedSources: ["company_website"],
      searchProvider: patch.searchProvider ?? "demo_fixture",
      aiModel: patch.aiModel ?? "demo-fixture",
      retrievedAt: new Date().toISOString(),
      expiresAt: null,
      identityMatch: (patch.identityMatch as never) ?? "unique",
      identityRationale: patch.identityRationale ?? null,
      failureMessage: patch.failureMessage ?? null,
      demoMode: true,
      sources: (patch.sources as never) ?? [],
      suggestions: (patch.suggestions as never) ?? [],
      summaryDraft: (patch.summaryDraft as never) ?? null,
      acceptedSummary: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it("returns no suggestions for ambiguous identity", async () => {
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "John Smith",
        firstName: "John",
        lastName: "Smith",
        email: DEMO_AMBIGUOUS_EMAIL,
      }),
    );

    const run = await startLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      allowedSources: ["company_website"],
    });

    expect(run.status).toBe("ambiguous");
    expect(run.suggestions).toEqual([]);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("stores cited proposals without writing the lead until accept", async () => {
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "Amira Keller",
        firstName: "Amira",
        lastName: "Keller",
        email: DEMO_UNIQUE_EMAIL,
      }),
    );

    const run = await startLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      allowedSources: ["company_website"],
    });

    expect(run.status).toBe("reviewing");
    expect(run.suggestions.length).toBeGreaterThan(0);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("refuses to overwrite CRM-entered values without acknowledgement", async () => {
    const suggestion = {
      id: "sug-job",
      fieldKey: "jobTitle" as const,
      proposedValue: "Head of Sales",
      currentValue: "Analyst",
      currentOrigin: "manual" as const,
      confidencePercent: 86,
      rationale: "Public team page",
      sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      retrievedAt: new Date().toISOString(),
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      status: "proposed" as const,
      acceptedValue: null,
      previousValue: null,
      previousProvenance: {
        method: "manual" as const,
        source: "lead_update",
        appliedAt: new Date().toISOString(),
        notes: null,
      },
      overwriteAcknowledged: false,
      decidedBy: null,
      decidedAt: null,
    };
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        jobTitle: "Analyst",
        intelligenceProvenance: {
          jobTitle: suggestion.previousProvenance,
        },
      }),
    );
    vi.mocked(findEnrichmentRunById).mockResolvedValue({
      id: "run-1",
      workspaceId: "ws-1",
      leadId: "lead-1",
      initiatedBy: "user-1",
      status: "reviewing",
      queryFullName: "Amira Keller",
      queryEmail: DEMO_UNIQUE_EMAIL,
      allowedSources: ["company_website"],
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      retrievedAt: new Date().toISOString(),
      expiresAt: null,
      identityMatch: "unique",
      identityRationale: null,
      failureMessage: null,
      demoMode: true,
      sources: [],
      suggestions: [suggestion],
      summaryDraft: null,
      acceptedSummary: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(
      applyLeadEnrichmentDecisions({
        workspaceId: "ws-1",
        leadId: "lead-1",
        runId: "run-1",
        actorId: "user-1",
        decisions: [{ suggestionId: "sug-job", action: "accept" }],
      }),
    ).rejects.toThrow(/overwrite/i);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("accepts with overwrite and never triggers campaign automation", async () => {
    const suggestion = {
      id: "sug-job",
      fieldKey: "jobTitle" as const,
      proposedValue: "Head of Sales",
      currentValue: "Analyst",
      currentOrigin: "manual" as const,
      confidencePercent: 86,
      rationale: "Public team page",
      sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      retrievedAt: new Date().toISOString(),
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      status: "proposed" as const,
      acceptedValue: null,
      previousValue: null,
      previousProvenance: {
        method: "manual" as const,
        source: "lead_update",
        appliedAt: new Date().toISOString(),
        notes: null,
      },
      overwriteAcknowledged: false,
      decidedBy: null,
      decidedAt: null,
    };
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({ jobTitle: "Analyst" }),
    );
    vi.mocked(findEnrichmentRunById).mockResolvedValue({
      id: "run-1",
      workspaceId: "ws-1",
      leadId: "lead-1",
      initiatedBy: "user-1",
      status: "reviewing",
      queryFullName: "Amira Keller",
      queryEmail: DEMO_UNIQUE_EMAIL,
      allowedSources: ["company_website"],
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      retrievedAt: new Date().toISOString(),
      expiresAt: null,
      identityMatch: "unique",
      identityRationale: null,
      failureMessage: null,
      demoMode: true,
      sources: [],
      suggestions: [suggestion],
      summaryDraft: null,
      acceptedSummary: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(resolveOrCreateCompanyByName).mockResolvedValue(null);
    vi.mocked(updateLead).mockResolvedValue(buildTestLeadRecord({ jobTitle: "Head of Sales" }));

    await applyLeadEnrichmentDecisions({
      workspaceId: "ws-1",
      leadId: "lead-1",
      runId: "run-1",
      actorId: "user-1",
      decisions: [
        { suggestionId: "sug-job", action: "accept", overwriteAcknowledged: true },
      ],
    });

    expect(updateLead).toHaveBeenCalled();
    const patch = vi.mocked(updateLead).mock.calls[0]![2];
    expect(patch.jobTitle).toBe("Head of Sales");
    expect(patch.intelligenceProvenance?.jobTitle?.method).toBe("enrichment");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.enrichment_reviewed",
        after: expect.objectContaining({ triggerAutomation: false }),
      }),
    );
  });

  it("stays disabled when the workspace flag is off", async () => {
    vi.mocked(findWorkspaceById).mockResolvedValue({
      ...workspace,
      leadEnrichment: { ...workspace.leadEnrichment, enabled: false },
    } as never);
    await expect(
      startLeadEnrichment({
        workspaceId: "ws-1",
        leadId: "lead-1",
        actorId: "user-1",
        allowedSources: ["company_website"],
      }),
    ).rejects.toThrow(/turned off/i);
  });
});
