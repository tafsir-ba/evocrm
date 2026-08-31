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
  getEnv: vi.fn(() => ({
    OPENAI_API_KEY: undefined,
    TAVILY_API_KEY: undefined,
    BRAVE_SEARCH_API_KEY: undefined,
    LEAD_ENRICHMENT_DEMO: undefined,
    OPENAI_ENRICHMENT_MODEL: undefined,
  })),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import { findCompaniesByIds } from "@/server/repositories/companies";
import {
  createEnrichmentRun,
  findEnrichmentRunById,
  listEnrichmentRunsForLead,
  newSuggestionId,
  revokeEnrichmentRunsForLead,
  updateEnrichmentRun,
} from "@/server/repositories/lead-enrichment";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { getEnv } from "@/server/env";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  applyLeadEnrichmentDecisions,
  getLeadEnrichmentCapability,
  revokeLeadEnrichment,
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
  let suggestionSeq = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnv).mockReset();
    vi.mocked(getEnv).mockImplementation(
      () =>
        ({
          OPENAI_API_KEY: undefined,
          TAVILY_API_KEY: undefined,
          BRAVE_SEARCH_API_KEY: undefined,
          LEAD_ENRICHMENT_DEMO: undefined,
          OPENAI_ENRICHMENT_MODEL: undefined,
        }) as never,
    );
    suggestionSeq = 0;
    vi.mocked(newSuggestionId).mockImplementation(() => `sug-${++suggestionSeq}`);
    vi.mocked(findWorkspaceById).mockResolvedValue(workspace as never);
    vi.mocked(findCompaniesByIds).mockResolvedValue([]);
    vi.mocked(resolveOrCreateCompanyByName).mockResolvedValue({
      company: { id: "co-1", name: "Example Corp" },
      created: true,
    } as never);
    vi.mocked(updateLead).mockResolvedValue(buildTestLeadRecord());
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
    vi.mocked(updateEnrichmentRun).mockImplementation(async (_ws, id, patch) => {
      const record = {
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
        acceptedSummary: (patch.acceptedSummary as never) ?? null,
        revokedAt: null,
        revokedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(findEnrichmentRunById).mockResolvedValue(record);
      return record;
    });
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

  it("applies cited safe fields immediately after a unique match", async () => {
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

    expect(run.status).toBe("accepted");
    expect(run.suggestions.length).toBeGreaterThan(0);
    expect(run.suggestions.every((item) => item.status === "accepted")).toBe(true);
    expect(updateLead).toHaveBeenCalled();
    const patch = vi.mocked(updateLead).mock.calls[0]![2];
    expect(patch.jobTitle).toBe("Head of Sales");
    expect(patch.intelligenceProvenance?.jobTitle?.method).toBe("enrichment");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ triggerAutomation: false }),
      }),
    );
  });

  it("does not auto-apply over CRM-entered values", async () => {
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "Amira Keller",
        firstName: "Amira",
        lastName: "Keller",
        email: DEMO_UNIQUE_EMAIL,
        jobTitle: "Analyst",
        intelligenceProvenance: {
          jobTitle: {
            method: "manual",
            source: "lead_update",
            appliedAt: new Date().toISOString(),
            notes: null,
          },
        },
      }),
    );

    const run = await startLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
    });

    const job = run.suggestions.find((item) => item.fieldKey === "jobTitle");
    expect(job?.status).toBe("proposed");
    const patch = vi.mocked(updateLead).mock.calls[0]?.[2];
    expect(patch?.jobTitle).toBeUndefined();
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

  it("edits an accepted enrichment value without requiring overwrite", async () => {
    const suggestion = {
      id: "sug-job",
      fieldKey: "jobTitle" as const,
      proposedValue: "Head of Sales",
      currentValue: null,
      currentOrigin: null,
      confidencePercent: 86,
      rationale: "Public team page",
      sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      retrievedAt: new Date().toISOString(),
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      status: "accepted" as const,
      acceptedValue: "Head of Sales",
      previousValue: null,
      previousProvenance: null,
      overwriteAcknowledged: false,
      decidedBy: "user-1",
      decidedAt: new Date().toISOString(),
    };
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({ jobTitle: "Head of Sales" }),
    );
    vi.mocked(findEnrichmentRunById).mockResolvedValue({
      id: "run-1",
      workspaceId: "ws-1",
      leadId: "lead-1",
      initiatedBy: "user-1",
      status: "accepted",
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

    await applyLeadEnrichmentDecisions({
      workspaceId: "ws-1",
      leadId: "lead-1",
      runId: "run-1",
      actorId: "user-1",
      decisions: [{ suggestionId: "sug-job", action: "edit", editedValue: "Sales Director" }],
    });

    const patch = vi.mocked(updateLead).mock.calls[0]![2];
    expect(patch.jobTitle).toBe("Sales Director");
    expect(patch.intelligenceProvenance?.jobTitle?.method).toBe("enrichment");
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

  it("treats a missing workspace flag as enabled", async () => {
    vi.mocked(findWorkspaceById).mockResolvedValue({ id: "ws-1" } as never);
    const capability = await getLeadEnrichmentCapability("ws-1");
    expect(capability.reasonDisabled).not.toMatch(/turned off/i);
    expect(capability.reasonDisabled).toMatch(/OPENAI_API_KEY/);
  });

  it("fails without inventing a profile when search returns no sources", async () => {
    vi.mocked(getEnv).mockImplementation(
      () =>
        ({
          OPENAI_API_KEY: "sk-test",
          TAVILY_API_KEY: undefined,
          BRAVE_SEARCH_API_KEY: undefined,
          LEAD_ENRICHMENT_DEMO: undefined,
          OPENAI_ENRICHMENT_MODEL: undefined,
        }) as never,
    );
    vi.mocked(findWorkspaceById).mockResolvedValue({
      ...workspace,
      leadEnrichment: { ...workspace.leadEnrichment, demoMode: false },
    } as never);
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "Alisa Scarlett-Buchanan",
        firstName: "Alisa",
        lastName: "Scarlett-Buchanan",
        email: "alisa@example-agency.ch",
      }),
    );

    const run = await startLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      providers: {
        search: async () => ({ hits: [], provider: "openai_web_search" }),
        synthesize: async () => {
          throw new Error("should not synthesize without hits");
        },
      },
    });

    expect(run.status).toBe("failed");
    expect(run.failureMessage).toMatch(/will not invent/i);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("does not apply a foreign-country profile when the lead’s phone is Swiss", async () => {
    vi.mocked(getEnv).mockImplementation(
      () =>
        ({
          OPENAI_API_KEY: "sk-test",
          TAVILY_API_KEY: undefined,
          BRAVE_SEARCH_API_KEY: undefined,
          LEAD_ENRICHMENT_DEMO: undefined,
          OPENAI_ENRICHMENT_MODEL: undefined,
        }) as never,
    );
    vi.mocked(findWorkspaceById).mockResolvedValue({
      ...workspace,
      defaultCurrency: "CHF",
      leadEnrichment: { ...workspace.leadEnrichment, demoMode: false },
    } as never);
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({
        fullName: "philippe.nougaret@gmail.com",
        firstName: "philippe.nougaret@gmail.com",
        lastName: "",
        email: "philippe.nougaret@gmail.com",
        phone: "0763162433",
        phoneNormalized: "0763162433",
      }),
    );

    const canadaHit = {
      url: "https://theorg.com/org/caisse-de-depot-et-placement-du-quebec/org-chart/philippe-nougaret",
      title: "Philippe Nougaret — CDPQ",
      snippet: "Vice President, Global Enterprise Risk, Montréal, Canada",
      retrievedAt: "2026-08-31T12:00:00.000Z",
    };

    const run = await startLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
      providers: {
        search: async () => ({ hits: [canadaHit], provider: "tavily" }),
        synthesize: async () => ({
          identityMatch: "unique",
          identityRationale: "One org-chart profile",
          model: "gpt-test",
          suggestions: [
            {
              fieldKey: "companyName",
              value: "Caisse de dépôt et placement du Québec",
              confidencePercent: 85,
              rationale: "theorg",
              sourceUrls: [canadaHit.url],
            },
            {
              fieldKey: "jobTitle",
              value: "Vice President, Global Enterprise Risk",
              confidencePercent: 85,
              rationale: "theorg",
              sourceUrls: [canadaHit.url],
            },
            {
              fieldKey: "city",
              value: "Montréal",
              confidencePercent: 85,
              rationale: "theorg",
              sourceUrls: [canadaHit.url],
            },
            {
              fieldKey: "country",
              value: "Canada",
              confidencePercent: 85,
              rationale: "theorg",
              sourceUrls: [canadaHit.url],
            },
          ],
          summary: { text: "CDPQ VP in Montréal", citationUrls: [canadaHit.url] },
        }),
      },
    });

    expect(run.status).toBe("ambiguous");
    expect(run.identityRationale).toMatch(/different country/i);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("revokes by restoring accepted fields without wiping the audit trail", async () => {
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
      status: "accepted" as const,
      acceptedValue: "Head of Sales",
      previousValue: "Analyst",
      previousProvenance: {
        method: "manual" as const,
        source: "lead_update",
        appliedAt: new Date().toISOString(),
        notes: null,
      },
      overwriteAcknowledged: true,
      decidedBy: "user-1",
      decidedAt: new Date().toISOString(),
    };
    const run = {
      id: "run-1",
      workspaceId: "ws-1",
      leadId: "lead-1",
      initiatedBy: "user-1",
      status: "accepted" as const,
      queryFullName: "Amira Keller",
      queryEmail: DEMO_UNIQUE_EMAIL,
      allowedSources: ["company_website"],
      searchProvider: "demo_fixture",
      aiModel: "demo-fixture",
      retrievedAt: new Date().toISOString(),
      expiresAt: null,
      identityMatch: "unique" as const,
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
    };
    vi.mocked(findLeadById).mockResolvedValue(
      buildTestLeadRecord({ jobTitle: "Head of Sales" }),
    );
    vi.mocked(listEnrichmentRunsForLead).mockResolvedValue([run]);
    vi.mocked(findEnrichmentRunById).mockResolvedValue(run);
    vi.mocked(revokeEnrichmentRunsForLead).mockResolvedValue(1);

    await revokeLeadEnrichment({
      workspaceId: "ws-1",
      leadId: "lead-1",
      actorId: "user-1",
    });

    expect(updateLead).toHaveBeenCalled();
    expect(vi.mocked(updateLead).mock.calls[0]![2].jobTitle).toBe("Analyst");
    expect(revokeEnrichmentRunsForLead).toHaveBeenCalled();
  });
});
