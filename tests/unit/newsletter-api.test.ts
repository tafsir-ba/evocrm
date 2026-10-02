import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/newsletters", () => ({
  previewNewsletterAudienceForWorkspace: vi.fn(),
  exportNewsletterAudienceExclusionsCsvForWorkspace: vi.fn(),
  replaceNewsletterSegmentsForWorkspace: vi.fn(),
  listNewsletterSegmentsForWorkspace: vi.fn(),
  scheduleNewsletterForWorkspace: vi.fn(),
  sendNewsletterNowForWorkspace: vi.fn(),
  cancelNewsletterScheduleForWorkspace: vi.fn(),
  createNewsletterAudienceImportForWorkspace: vi.fn(),
  sendNewsletterTestEmailsForWorkspace: vi.fn(),
}));

import { GET as previewAudience } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/audience/preview/route";
import { PUT as putSegments } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/audience/segments/route";
import { POST as importAudience } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/audience/import/route";
import { POST as scheduleNewsletter } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/schedule/route";
import { POST as sendNewsletter } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/send/route";
import { POST as testSendNewsletter } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/test-send/route";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  previewNewsletterAudienceForWorkspace,
  replaceNewsletterSegmentsForWorkspace,
  scheduleNewsletterForWorkspace,
  sendNewsletterNowForWorkspace,
  createNewsletterAudienceImportForWorkspace,
  sendNewsletterTestEmailsForWorkspace,
} from "@/server/services/newsletters";
import { campaignRecordExtras } from "@/tests/helpers/crm-fixtures";

const sampleCampaign = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Spring update",
  status: "active" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  kind: "newsletter" as const,
  frequency: null,
  defaultFromName: "Evo",
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stepCount: 1,
  enrollmentCount: 12,
};

describe("newsletter API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceApiAccess).mockResolvedValue({
      userId: "user-1",
      workspace: {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        timezone: "Europe/Zurich",
        defaultCurrency: "CHF",
      },
      membership: null,
      permissions: ["campaign:read", "campaign:update", "lead:create"],
      accessMode: "member",
      isWorkspaceAdmin: true,
    } as never);
  });

  it("returns audience preview", async () => {
    vi.mocked(previewNewsletterAudienceForWorkspace).mockResolvedValue({
      summary: {
        queued: 2,
        excludedMissingEmail: 0,
        excludedUnsubscribed: 1,
        excludedSuppressed: 0,
        excludedInvalid: 0,
        excludedArchived: 0,
        excludedUnknownConsent: 0,
        unknownConsent: 1,
        deduped: 0,
      },
      unknownConsentPolicy: "include_and_flag",
      includedSample: [],
      flaggedUnknownConsentSample: [],
      exclusionSample: [],
      exclusions: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      flaggedUnknownConsent: { items: [], total: 0 },
      exclusionCounts: {
        missingEmail: 0,
        unsubscribed: 1,
        suppressed: 0,
        invalid: 0,
        archived: 0,
        unknownConsent: 0,
        deduped: 0,
      },
      importSummaries: [],
    });

    const response = await previewAudience(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.preview.summary.queued).toBe(2);
    expect(body.data.preview.summary.unknownConsent).toBe(1);
  });

  it("replaces multi-type audience segments", async () => {
    vi.mocked(replaceNewsletterSegmentsForWorkspace).mockResolvedValue([
      {
        id: "seg-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "project_tags",
        order: 1,
        projectId: "507f1f77bcf86cd799439011",
        tagIds: [],
        tagMatch: "any",
        importJobId: null,
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seg-2",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "csv_import",
        order: 2,
        projectId: "507f1f77bcf86cd799439011",
        tagIds: [],
        tagMatch: "any",
        importJobId: "507f1f77bcf86cd799439022",
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await putSegments(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: [
            {
              type: "project_tags",
              projectId: "507f1f77bcf86cd799439011",
              tagIds: [],
              tagMatch: "any",
            },
            {
              type: "csv_import",
              projectId: "507f1f77bcf86cd799439011",
              importJobId: "507f1f77bcf86cd799439022",
            },
          ],
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.segments).toHaveLength(2);
    expect(replaceNewsletterSegmentsForWorkspace).toHaveBeenCalled();
  });

  it("starts a newsletter CSV import without drip enrollment", async () => {
    vi.mocked(createNewsletterAudienceImportForWorkspace).mockResolvedValue({
      job: { id: "import-1", newsletterCampaignId: "camp-1" },
      columns: [],
      previewRows: [],
      rowCount: 2,
      warnings: [],
      newsletter: {
        campaignId: "camp-1",
        targetProjectId: "507f1f77bcf86cd799439011",
        applyTagId: null,
        dripCampaignEvaluationEnabled: false,
      },
    } as never);

    const file = new File(["email\nada@example.com"], "list.csv", { type: "text/csv" });
    const formData = {
      get(key: string) {
        if (key === "file") return file;
        if (key === "targetProjectId") return "507f1f77bcf86cd799439011";
        if (key === "applyTagId") return null;
        return null;
      },
    };

    const request = {
      formData: async () => formData,
    } as unknown as Request;

    const response = await importAudience(request, {
      params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.newsletter.dripCampaignEvaluationEnabled).toBe(false);
    expect(createNewsletterAudienceImportForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp-1",
        targetProjectId: "507f1f77bcf86cd799439011",
      }),
    );
  });

  it("schedules and sends newsletters", async () => {
    vi.mocked(scheduleNewsletterForWorkspace).mockResolvedValue(sampleCampaign);
    vi.mocked(sendNewsletterNowForWorkspace).mockResolvedValue(sampleCampaign);

    const scheduleResponse = await scheduleNewsletter(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledForLocal: "2026-10-02T09:00" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );

    const sendResponse = await sendNewsletter(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }),
    });

    expect(scheduleResponse.status).toBe(200);
    expect(sendResponse.status).toBe(200);
    expect(scheduleNewsletterForWorkspace).toHaveBeenCalled();
    expect(sendNewsletterNowForWorkspace).toHaveBeenCalled();
  });

  it("sends newsletter test emails with campaign:update", async () => {
    vi.mocked(sendNewsletterTestEmailsForWorkspace).mockResolvedValue({
      sent: 2,
      messageIds: ["msg-1", "msg-2"],
    });

    const response = await testSendNewsletter(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: "ada@example.com, bob@example.com",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.sent).toBe(2);
    expect(requireWorkspaceApiAccess).toHaveBeenCalledWith("demo", "campaign:update");
    expect(sendNewsletterTestEmailsForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      "camp-1",
      ["ada@example.com", "bob@example.com"],
    );
  });

  it("rejects invalid test-send addresses without calling the service", async () => {
    const response = await testSendNewsletter(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: "not-an-email, also bad" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error?.message).toMatch(/invalid/i);
    expect(sendNewsletterTestEmailsForWorkspace).not.toHaveBeenCalled();
  });
});
