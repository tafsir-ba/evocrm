import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspaces/require-workspace-api-access", () => ({
  requireWorkspaceApiAccess: vi.fn(),
}));

vi.mock("@/server/services/newsletters", () => ({
  previewNewsletterAudienceForWorkspace: vi.fn(),
  replaceNewsletterSegmentsForWorkspace: vi.fn(),
  listNewsletterSegmentsForWorkspace: vi.fn(),
  scheduleNewsletterForWorkspace: vi.fn(),
  sendNewsletterNowForWorkspace: vi.fn(),
  cancelNewsletterScheduleForWorkspace: vi.fn(),
}));

import { GET as previewAudience } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/audience/preview/route";
import { PUT as putSegments } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/audience/segments/route";
import { POST as scheduleNewsletter } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/schedule/route";
import { POST as sendNewsletter } from "@/app/api/workspaces/[workspaceSlug]/newsletters/[campaignId]/send/route";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  previewNewsletterAudienceForWorkspace,
  replaceNewsletterSegmentsForWorkspace,
  scheduleNewsletterForWorkspace,
  sendNewsletterNowForWorkspace,
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
      permissions: ["campaign:read", "campaign:update"],
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
        unknownConsent: 1,
        deduped: 0,
      },
      includedSample: [],
      flaggedUnknownConsentSample: [],
      exclusionSample: [],
      exclusionCounts: {
        missingEmail: 0,
        unsubscribed: 1,
        suppressed: 0,
        invalid: 0,
        archived: 0,
        deduped: 0,
      },
    });

    const response = await previewAudience(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.preview.summary.queued).toBe(2);
    expect(body.data.preview.summary.unknownConsent).toBe(1);
  });

  it("replaces audience segments", async () => {
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
          ],
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", campaignId: "camp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.segments).toHaveLength(1);
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
});
