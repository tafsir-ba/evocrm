import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  campaignRecordExtras,
  leadRecordExtras,
  opportunityRecordExtras,
} from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  findNonTerminalEnrollmentTargetIds: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeads: vi.fn(),
}));

vi.mock("@/server/services/opportunities", () => ({
  listOpportunitiesForWorkspace: vi.fn(),
}));

import { findCampaignById } from "@/server/repositories/campaigns";
import { findNonTerminalEnrollmentTargetIds } from "@/server/repositories/campaign-enrollments";
import { findLeads } from "@/server/repositories/leads";
import { listEnrollmentCandidatesForWorkspace } from "@/server/services/campaign-enrollments";
import { listOpportunitiesForWorkspace } from "@/server/services/opportunities";

const campaignCreatedAt = new Date("2026-06-14T08:00:00.000Z");

const baseCampaign = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Test drip",
  status: "draft" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  frequency: "manual",
  defaultFromName: null,
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: campaignCreatedAt,
  updatedAt: campaignCreatedAt,
};

const sampleLead = {
  id: "lead-new",
  workspaceId: "ws-1",
  ...leadRecordExtras,
  archivedAt: null,
  statusId: "status-1",
  sourceId: null,
  ownerId: null,
  assignedTo: null,
  firstName: "Tafsir",
  lastName: "Ba",
  fullName: "Tafsir Ba",
  email: "tafsir@example.com",
  emailNormalized: "tafsir@example.com",
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
  createdAt: new Date("2026-06-15T10:00:00.000Z"),
  updatedAt: new Date("2026-06-15T10:00:00.000Z"),
};

describe("listEnrollmentCandidatesForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(baseCampaign);
    vi.mocked(findNonTerminalEnrollmentTargetIds).mockResolvedValue({
      leadIds: [],
      opportunityIds: [],
    });
  });

  it("returns unenrolled leads for the workspace", async () => {
    vi.mocked(findLeads).mockResolvedValue({
      leads: [sampleLead],
      total: 1,
    });

    const result = await listEnrollmentCandidatesForWorkspace("ws-1", "camp-1");

    expect(findLeads).toHaveBeenCalledWith("ws-1", {
      search: undefined,
      excludeIds: [],
      excludeCampaignGuarded: true,
      page: 1,
      pageSize: 50,
    });
    expect(result.candidates).toEqual([
      expect.objectContaining({
        audienceType: "leads",
        id: "lead-new",
        fullName: "Tafsir Ba",
        email: "tafsir@example.com",
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it("excludes enrolled lead ids in the repository query", async () => {
    vi.mocked(findNonTerminalEnrollmentTargetIds).mockResolvedValue({
      leadIds: ["lead-enrolled"],
      opportunityIds: [],
    });
    vi.mocked(findLeads).mockResolvedValue({
      leads: [sampleLead],
      total: 1,
    });

    await listEnrollmentCandidatesForWorkspace("ws-1", "camp-1");

    expect(findLeads).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        excludeIds: ["lead-enrolled"],
      }),
    );
  });

  it("returns repository total instead of the current page length", async () => {
    vi.mocked(findLeads).mockResolvedValue({
      leads: [sampleLead],
      total: 11,
    });

    const result = await listEnrollmentCandidatesForWorkspace("ws-1", "camp-1", {
      page: 2,
      pageSize: 50,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.total).toBe(11);
  });

  it("returns empty candidates for archived campaigns", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "archived",
      archivedAt: new Date(),
    });

    const result = await listEnrollmentCandidatesForWorkspace("ws-1", "camp-1");

    expect(result).toEqual({ candidates: [], total: 0 });
    expect(findLeads).not.toHaveBeenCalled();
  });

  it("loads opportunity candidates for opportunity campaigns", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      audienceType: "opportunities",
  ...campaignRecordExtras,
    });
    vi.mocked(listOpportunitiesForWorkspace).mockResolvedValue({
      opportunities: [
        {
          id: "opp-1",
          workspaceId: "ws-1",
          ...opportunityRecordExtras,
          leadId: "lead-1",
          propertyId: "prop-1",
          statusId: "status-1",
          lostReasonId: null,
          ownerId: null,
          assignedTo: null,
          value: null,
          currency: "CHF",
          probability: null,
          expectedCloseDate: null,
          notes: null,
          tags: [],
          createdBy: "user-1",
          archivedAt: null,
          closedAt: null,
          wonAt: null,
          lostAt: null,
          lostReasonText: null,
          createdAt: new Date("2026-06-15T10:00:00.000Z"),
          updatedAt: new Date("2026-06-15T10:00:00.000Z"),
          status: { id: "status-1", label: "New", color: "#000", key: "new" },
          lostReason: null,
          lead: {
            id: "lead-1",
            fullName: "Jane Doe",
            email: "jane@example.com",
            phone: null,
            propertyTypeInterests: [],
            transactionIntent: null,
            usagePurpose: null,
          },
          property: {
            id: "prop-1",
            title: "Lake View",
            reference: "LV-01",
            price: null,
            currency: "CHF",
          },
          tagsResolved: [],
          assignedUser: null,
          project: null,
        },
      ],
      total: 1,
    });

    const result = await listEnrollmentCandidatesForWorkspace("ws-1", "camp-1");

    expect(listOpportunitiesForWorkspace).toHaveBeenCalledWith("ws-1", {
      search: undefined,
      excludeIds: [],
      page: 1,
      pageSize: 50,
    });
    expect(result.candidates).toEqual([
      expect.objectContaining({
        audienceType: "opportunities",
        id: "opp-1",
        lead: expect.objectContaining({ fullName: "Jane Doe" }),
      }),
    ]);
    expect(result.total).toBe(1);
  });
});
