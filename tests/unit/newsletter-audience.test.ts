import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NEWSLETTER_AUDIENCE_LIMIT } from "@/lib/newsletter";
import { AppError } from "@/server/errors";

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  findLeadIdsForProjectMembership: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadsByIds: vi.fn(),
}));

vi.mock("@/server/repositories/email-suppressions", () => ({
  findSuppressionsByEmails: vi.fn(),
}));

vi.mock("@/server/repositories/newsletter-audience-segments", () => ({
  findNewsletterAudienceSegments: vi.fn(),
}));

vi.mock("@/server/repositories/import-jobs", () => ({
  findImportJobById: vi.fn(),
}));

import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import { findLeadsByIds } from "@/server/repositories/leads";
import { findSuppressionsByEmails } from "@/server/repositories/email-suppressions";
import { findNewsletterAudienceSegments } from "@/server/repositories/newsletter-audience-segments";
import { findImportJobById } from "@/server/repositories/import-jobs";
import {
  assertNewsletterAudienceSendable,
  resolveNewsletterAudience,
} from "@/server/services/newsletter-audience";

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    workspaceId: "ws-1",
    projectId: "proj-1",
    statusId: "status-1",
    sourceId: null,
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
    industry: null,
    jobTitle: null,
    stateRegion: null,
    notes: null,
    tags: ["tag-1"],
    attributes: {},
    emailConsentStatus: "unknown",
    emailUnsubscribedAt: null,
    emailUnsubscribeReason: null,
    lastContactedAt: null,
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    intelligenceProvenance: {},
    ...overrides,
  };
}

describe("newsletter audience resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes membership leads, flags unknown consent, and excludes unsubscribed", async () => {
    vi.mocked(findNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "project_tags",
        order: 1,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: null,
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue([
      "lead-1",
      "lead-2",
      "lead-3",
    ]);
    vi.mocked(findLeadsByIds).mockResolvedValue([
      lead({ id: "lead-1", emailConsentStatus: "unknown" }),
      lead({
        id: "lead-2",
        email: "bob@example.com",
        emailNormalized: "bob@example.com",
        fullName: "Bob",
        emailConsentStatus: "subscribed",
      }),
      lead({
        id: "lead-3",
        email: "cara@example.com",
        emailNormalized: "cara@example.com",
        fullName: "Cara",
        emailConsentStatus: "unsubscribed",
        emailUnsubscribedAt: new Date(),
      }),
    ]);
    vi.mocked(findSuppressionsByEmails).mockResolvedValue([]);

    const result = await resolveNewsletterAudience("ws-1", "camp-1");

    expect(result.included).toHaveLength(2);
    expect(result.summary.unknownConsent).toBe(1);
    expect(result.flaggedUnknownConsent).toHaveLength(1);
    expect(result.summary.excludedUnsubscribed).toBe(1);
    expect(result.included.map((row) => row.email).sort()).toEqual([
      "ada@example.com",
      "bob@example.com",
    ]);
  });

  it("dedupes by normalized email preferring primary project lead", async () => {
    vi.mocked(findNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "project_tags",
        order: 1,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: null,
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue(["lead-a", "lead-b"]);
    vi.mocked(findLeadsByIds).mockResolvedValue([
      lead({
        id: "lead-a",
        projectId: "other",
        email: "same@example.com",
        emailNormalized: "same@example.com",
        emailConsentStatus: "subscribed",
      }),
      lead({
        id: "lead-b",
        projectId: "proj-1",
        email: "same@example.com",
        emailNormalized: "same@example.com",
        emailConsentStatus: "subscribed",
        fullName: "Primary Match",
      }),
    ]);
    vi.mocked(findSuppressionsByEmails).mockResolvedValue([]);

    const result = await resolveNewsletterAudience("ws-1", "camp-1");

    expect(result.included).toHaveLength(1);
    expect(result.included[0]?.leadId).toBe("lead-b");
    expect(result.summary.deduped).toBe(1);
  });

  it("unions project and csv segments with email dedupe", async () => {
    vi.mocked(findNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-project",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "project_tags",
        order: 1,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: null,
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seg-csv",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "csv_import",
        order: 2,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: "import-1",
        applyTagId: "tag-list",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue(["lead-1"]);
    vi.mocked(findImportJobById).mockResolvedValue({
      id: "import-1",
      workspaceId: "ws-1",
      entityType: "lead",
      status: "completed",
      createdCount: 1,
      skippedCount: 1,
      failedCount: 0,
      newsletterCampaignId: "camp-1",
      rowResults: [
        { rowNumber: 1, status: "created", entityId: "lead-2", errors: [], warnings: [] },
        { rowNumber: 2, status: "skipped", entityId: "lead-1", errors: [], warnings: [] },
      ],
    } as never);
    vi.mocked(findLeadsByIds).mockImplementation(async (_ws, ids) =>
      ids.map((id) =>
        lead({
          id,
          email: id === "lead-1" ? "ada@example.com" : "new@example.com",
          emailNormalized: id === "lead-1" ? "ada@example.com" : "new@example.com",
          emailConsentStatus: "subscribed",
          fullName: id,
        }),
      ),
    );
    vi.mocked(findSuppressionsByEmails).mockResolvedValue([]);

    const result = await resolveNewsletterAudience("ws-1", "camp-1");

    expect(result.included).toHaveLength(2);
    expect(result.included.map((row) => row.email).sort()).toEqual([
      "ada@example.com",
      "new@example.com",
    ]);
    expect(result.importSummaries).toHaveLength(1);
    expect(result.importSummaries[0]?.resolvedLeadCount).toBe(2);
    expect(result.summary.deduped).toBe(0);
  });

  it("rejects csv segments whose import is not finished", async () => {
    vi.mocked(findNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-csv",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "csv_import",
        order: 1,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: "import-1",
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(findImportJobById).mockResolvedValue({
      id: "import-1",
      workspaceId: "ws-1",
      entityType: "lead",
      status: "ready",
      newsletterCampaignId: "camp-1",
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      rowResults: [],
    } as never);

    await expect(resolveNewsletterAudience("ws-1", "camp-1")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("rejects audiences over the hard cap", async () => {
    vi.mocked(findNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "project_tags",
        order: 1,
        projectId: "proj-1",
        tagIds: [],
        tagMatch: "any",
        importJobId: null,
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const ids = Array.from({ length: 3 }, (_, index) => `lead-${index}`);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue(ids);
    vi.mocked(findLeadsByIds).mockResolvedValue(
      ids.map((id, index) =>
        lead({
          id,
          email: `user${index}@example.com`,
          emailNormalized: `user${index}@example.com`,
          emailConsentStatus: "subscribed",
        }),
      ),
    );
    vi.mocked(findSuppressionsByEmails).mockResolvedValue([]);

    await expect(
      resolveNewsletterAudience("ws-1", "camp-1", { audienceLimit: 2 }),
    ).rejects.toBeInstanceOf(AppError);

    expect(DEFAULT_NEWSLETTER_AUDIENCE_LIMIT).toBe(10_000);
  });

  it("assertNewsletterAudienceSendable requires included recipients", () => {
    expect(() =>
      assertNewsletterAudienceSendable({
        included: [],
        exclusions: [],
        flaggedUnknownConsent: [],
        summary: {
          queued: 0,
          excludedMissingEmail: 0,
          excludedUnsubscribed: 0,
          excludedSuppressed: 0,
          excludedInvalid: 0,
          excludedArchived: 0,
          unknownConsent: 0,
          deduped: 0,
        },
        importSummaries: [],
      }),
    ).toThrow(AppError);
  });
});
