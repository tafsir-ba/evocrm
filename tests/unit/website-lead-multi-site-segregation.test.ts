/**
 * Practical multi-website segregation investigation tests.
 *
 * Simulates Website A → Project A and Website B → Project B,
 * then verifies attribution, filtering, cross-project controls,
 * duplicate handling, and failure modes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/integrations", () => ({
  findActiveWebsiteIntegrationByApiKeyHash: vi.fn(),
  findWebsiteIntegrationByApiKeyHash: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadByEmailNormalized: vi.fn(),
  findLeadByIntegrationIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjects: vi.fn(),
  findProjectById: vi.fn(),
  findProjectByReference: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
  normalizeLeadEmail: vi.fn((email: string) => ({
    email,
    emailNormalized: email.toLowerCase(),
  })),
}));

vi.mock("@/server/services/integration-logs", () => ({
  buildWebsiteLeadPayloadSummary: vi.fn(() => ({ emailPresent: true })),
  writeIntegrationLog: vi.fn(),
}));

vi.mock("@/server/services/integration-api-keys", () => ({
  hashIntegrationApiKey: vi.fn((key: string) => `hash:${key}`),
  parseIntegrationApiKeyFromRequest: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findProjectById,
  findProjectByReference,
  findProjects,
} from "@/server/repositories/projects";
import {
  findActiveWebsiteIntegrationByApiKeyHash,
  findWebsiteIntegrationByApiKeyHash,
} from "@/server/repositories/integrations";
import {
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
} from "@/server/repositories/leads";
import { createLeadForWorkspace } from "@/server/services/leads";
import {
  captureWebsiteLead,
  resolveWebsiteLeadProjectId,
} from "@/server/services/website-lead-capture";
import { AppError } from "@/server/errors";

const PROJECT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

const projectA = {
  id: PROJECT_A,
  workspaceId: "ws-1",
  name: "Project A",
  reference: "project-a",
  projectType: null,
  defaultDripCampaignId: null,
  statusId: null,
  address: null,
  city: null,
  country: null,
  description: null,
  createdBy: "user-1",
  ownerId: null,
  assignedTo: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const projectB = {
  ...projectA,
  id: PROJECT_B,
  name: "Project B",
  reference: "project-b",
};

const websiteA = {
  id: "int-website-a",
  workspaceId: "ws-1",
  type: "website" as const,
  name: "Website A",
  status: "active" as const,
  credentialsEncrypted: null,
  apiKeyHash: "hash:key-a",
  defaultProjectId: PROJECT_A,
  allowProjectOverride: false,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const websiteB = {
  ...websiteA,
  id: "int-website-b",
  name: "Website B",
  apiKeyHash: "hash:key-b",
  defaultProjectId: PROJECT_B,
};

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    workspaceId: "ws-1",
    ...leadRecordExtras,
    projectId: PROJECT_A,
    statusId: "status-1",
    sourceId: "source-1",
    ownerId: null,
    assignedTo: null,
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    emailNormalized: "ada@example.com",
    phone: null,
    phoneNormalized: null,
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
    attributes: {},
    emailConsentStatus: "unknown",
    emailUnsubscribedAt: null,
    emailUnsubscribeReason: null,
    lastContactedAt: null,
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: null,
    status: null,
    source: null,
    tagsResolved: [],
    assignedUser: null,
    ownerUser: null,
    ...overrides,
  };
}

describe("multi-website lead segregation (investigation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(async (_ws, type, key) => ({
      id: type === "lead_status" ? "status-1" : "source-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type,
      label: key,
      key,
      color: "#000",
      order: 0,
      isDefault: true,
      isActive: true,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue(null);
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);
    vi.mocked(findProjects).mockResolvedValue([projectA, projectB]);
    vi.mocked(findProjectById).mockImplementation(async (_ws, projectId) => {
      if (projectId === PROJECT_A) return projectA;
      if (projectId === PROJECT_B) return projectB;
      return null;
    });
    vi.mocked(findProjectByReference).mockImplementation(async (_ws, reference) => {
      if (reference === "project-a") return projectA;
      if (reference === "project-b") return projectB;
      return null;
    });

    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockImplementation(async (hash) => {
      if (hash === "hash:key-a") return websiteA;
      if (hash === "hash:key-b") return websiteB;
      return null;
    });
    vi.mocked(findWebsiteIntegrationByApiKeyHash).mockImplementation(async (hash) => {
      if (hash === "hash:key-a") return websiteA;
      if (hash === "hash:key-b") return websiteB;
      return null;
    });

    let leadCounter = 0;
    vi.mocked(createLeadForWorkspace).mockImplementation(async (_ws, _actor, input) => {
      leadCounter += 1;
      return {
        lead: makeLead({
          id: `lead-${leadCounter}`,
          projectId: input.projectId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          emailNormalized: input.email ? String(input.email).toLowerCase() : null,
          attributes: input.attributes ?? {},
        }),
        warnings: [],
      };
    });
  });

  it("routes Website A batch exclusively to Project A via defaultProjectId", async () => {
    const batch = [
      { firstName: "Alice", lastName: "A1", email: "alice-a1@site-a.test", utm: { campaign: "spring-a" } },
      { firstName: "Alice", lastName: "A2", email: "alice-a2@site-a.test", source: "website-a-contact" },
      { firstName: "Alice", lastName: "A3", email: "alice-a3@site-a.test", propertyReference: "PA-101" },
    ];

    const results = [];
    for (const lead of batch) {
      results.push(await captureWebsiteLead("key-a", lead));
    }

    expect(results).toHaveLength(3);
    expect(results.every((r) => !r.duplicate)).toBe(true);

    const createCalls = vi.mocked(createLeadForWorkspace).mock.calls;
    expect(createCalls).toHaveLength(3);

    for (const [, , input] of createCalls) {
      expect(input.projectId).toBe(PROJECT_A);
      expect(input.sourceId).toBe("source-1");
      expect(input.attributes).toMatchObject({
        integration: { integrationId: "int-website-a" },
      });
    }

    expect(createCalls[0][2].attributes).toMatchObject({
      integration: { utm: { campaign: "spring-a" } },
    });
    expect(createCalls[1][2].attributes).toMatchObject({
      integration: { inboundSource: "website-a-contact" },
    });
    expect(createCalls[2][2].attributes).toMatchObject({
      integration: { propertyReference: "PA-101" },
    });
  });

  it("routes Website B batch exclusively to Project B via defaultProjectId", async () => {
    const batch = [
      { firstName: "Bob", lastName: "B1", email: "bob-b1@site-b.test", utm: { campaign: "launch-b" } },
      { firstName: "Bob", lastName: "B2", email: "bob-b2@site-b.test" },
    ];

    for (const lead of batch) {
      await captureWebsiteLead("key-b", lead);
    }

    const createCalls = vi.mocked(createLeadForWorkspace).mock.calls;
    expect(createCalls).toHaveLength(2);

    for (const [, , input] of createCalls) {
      expect(input.projectId).toBe(PROJECT_B);
      expect(input.attributes).toMatchObject({
        integration: { integrationId: "int-website-b" },
      });
    }
  });

  it("keeps Website A and Website B leads in separate projects (no cross-contamination)", async () => {
    await captureWebsiteLead("key-a", {
      firstName: "A",
      lastName: "Only",
      email: "only-a@site-a.test",
    });
    await captureWebsiteLead("key-b", {
      firstName: "B",
      lastName: "Only",
      email: "only-b@site-b.test",
    });

    const [callA, callB] = vi.mocked(createLeadForWorkspace).mock.calls;
    expect(callA[2].projectId).toBe(PROJECT_A);
    expect(callB[2].projectId).toBe(PROJECT_B);
    expect(callA[2].projectId).not.toBe(callB[2].projectId);
  });

  it("allows several websites to feed the same project when defaults match", async () => {
    const websiteC = { ...websiteA, id: "int-website-c", name: "Website C", apiKeyHash: "hash:key-c" };
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockImplementation(async (hash) => {
      if (hash === "hash:key-a") return websiteA;
      if (hash === "hash:key-c") return websiteC;
      return null;
    });

    await captureWebsiteLead("key-a", {
      firstName: "Shared",
      lastName: "One",
      email: "shared-1@test.com",
    });
    await captureWebsiteLead("key-c", {
      firstName: "Shared",
      lastName: "Two",
      email: "shared-2@test.com",
    });

    const projects = vi.mocked(createLeadForWorkspace).mock.calls.map((c) => c[2].projectId);
    expect(projects).toEqual([PROJECT_A, PROJECT_A]);
  });

  it("allows one website to feed different projects when override is enabled", async () => {
    const overrideWebsite = { ...websiteA, allowProjectOverride: true };
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(overrideWebsite);

    await captureWebsiteLead("key-a", {
      firstName: "Page",
      lastName: "A",
      email: "page-a@test.com",
      projectId: PROJECT_A,
    });
    await captureWebsiteLead("key-a", {
      firstName: "Page",
      lastName: "B",
      email: "page-b@test.com",
      projectReference: "project-b",
    });

    const projects = vi.mocked(createLeadForWorkspace).mock.calls.map((c) => c[2].projectId);
    expect(projects).toEqual([PROJECT_A, PROJECT_B]);
  });

  it("blocks Website A from submitting into Project B when project override is locked", async () => {
    await expect(
      captureWebsiteLead("key-a", {
        firstName: "Cross",
        lastName: "Project",
        email: "cross@site-a.test",
        projectId: PROJECT_B,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("locked to its default project"),
    });

    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("allows Website A into Project B only when allowProjectOverride is enabled", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...websiteA,
      allowProjectOverride: true,
    });

    const result = await captureWebsiteLead("key-a", {
      firstName: "Cross",
      lastName: "Allowed",
      email: "cross-allowed@site-a.test",
      projectId: PROJECT_B,
    });

    expect(result.duplicate).toBe(false);
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        projectId: PROJECT_B,
        attributes: {
          integration: expect.objectContaining({ integrationId: "int-website-a" }),
        },
      }),
    );
  });

  it("rejects unknown project ids (cannot target projects outside the workspace)", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...websiteA,
      allowProjectOverride: true,
    });

    await expect(
      resolveWebsiteLeadProjectId({
        workspaceId: "ws-1",
        integration: { ...websiteA, allowProjectOverride: true },
        payload: { projectId: "cccccccccccccccccccccccc" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("handles duplicate idempotency keys without creating a second lead", async () => {
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue(
      makeLead({ id: "lead-existing", projectId: PROJECT_A }) as never,
    );

    const result = await captureWebsiteLead("key-a", {
      firstName: "Dup",
      lastName: "Key",
      email: "dup-key@site-a.test",
      idempotencyKey: "form-submit-1",
    });

    expect(result).toEqual({
      leadId: "lead-existing",
      duplicate: true,
      idempotent: true,
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("scopes email dedupe to the target project (same email allowed across projects)", async () => {
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);

    await captureWebsiteLead("key-a", {
      firstName: "Shared",
      lastName: "Email",
      email: "shared@example.com",
    });

    expect(findActiveLeadByEmailNormalized).toHaveBeenCalledWith(
      "ws-1",
      "shared@example.com",
      undefined,
      PROJECT_A,
    );
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        projectId: PROJECT_A,
        email: "shared@example.com",
      }),
    );
  });

  it("returns duplicate when the same email already exists in the target project", async () => {
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(
      makeLead({
        id: "lead-on-project-a",
        projectId: PROJECT_A,
        email: "shared@example.com",
        emailNormalized: "shared@example.com",
      }) as never,
    );

    const result = await captureWebsiteLead("key-a", {
      firstName: "Shared",
      lastName: "Email",
      email: "shared@example.com",
    });

    expect(result).toEqual({
      leadId: "lead-on-project-a",
      duplicate: true,
      idempotent: false,
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("fails clearly when multi-project workspace has no default and no project in payload", async () => {
    const unmapped = { ...websiteA, defaultProjectId: null };
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(unmapped);

    await expect(
      captureWebsiteLead("key-a", {
        firstName: "No",
        lastName: "Project",
        email: "noproject@test.com",
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      captureWebsiteLead("key-a", {
        firstName: "No",
        lastName: "Project",
        email: "noproject@test.com",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("default project"),
    });
  });

  it("fails clearly for invalid API keys", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);
    vi.mocked(findWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);

    await expect(
      captureWebsiteLead("bad-key", {
        firstName: "X",
        lastName: "Y",
        email: "xy@test.com",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("fails clearly when integration is paused", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);
    vi.mocked(findWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...websiteA,
      status: "paused",
    });

    await expect(
      captureWebsiteLead("key-a", {
        firstName: "X",
        lastName: "Y",
        email: "xy@test.com",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores permanent attribution fields: integrationId, utm, inboundSource, propertyReference", async () => {
    await captureWebsiteLead("key-a", {
      firstName: "Attr",
      lastName: "Test",
      email: "attr@site-a.test",
      externalId: "ext-99",
      idempotencyKey: "idem-99",
      source: "landing-hero",
      propertyReference: "PA-200",
      emailConsentStatus: "subscribed",
      utm: {
        source: "google",
        medium: "cpc",
        campaign: "spring-a",
        term: "geneva loft",
        content: "hero-cta",
      },
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        projectId: PROJECT_A,
        emailConsentStatus: "subscribed",
        attributes: {
          integration: {
            integrationId: "int-website-a",
            externalId: "ext-99",
            idempotencyKey: "idem-99",
            inboundSource: "landing-hero",
            propertyReference: "PA-200",
            utm: {
              source: "google",
              medium: "cpc",
              campaign: "spring-a",
              term: "geneva loft",
              content: "hero-cta",
            },
          },
        },
      }),
    );
  });
});
