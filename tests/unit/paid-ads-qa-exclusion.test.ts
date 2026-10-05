import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPaidAdsAttributionExcludePolicy,
  evaluatePaidAdsQaExclusion,
  isPaidAdsQaExcludedLead,
  paidAdsQaExclusionNotice,
} from "@/lib/paid-ads-qa-exclusion";
import { buildAdCopilotNextStep } from "@/lib/ad-copilot-next-step";

/** Live Satigny QA smoke shape (name present but not used alone). */
const LIVE_QA_LEAD = {
  email: "qa-satigny-paid@example.com",
  emailNormalized: "qa-satigny-paid@example.com",
  phone: "0000000000",
  phoneNormalized: "0000000000",
  notes: "QA seulement — Ne pas contacter",
  attributes: {
    integration: {
      utm: {
        source: "meta",
        medium: "paid_social",
        campaign: "satigny_ad_copilot_qa",
        content: "live_smoke",
      },
    },
  },
  fullName: "TEST Ad Copilot QA Satigny Paid Attribution",
};

const ORDINARY_PAID_LEAD = {
  email: "marie.dupont@gmail.com",
  emailNormalized: "marie.dupont@gmail.com",
  phone: "+41791234567",
  phoneNormalized: "41791234567",
  notes: "Interested in the Satigny duplex open house.",
  attributes: {
    integration: {
      utm: {
        source: "meta",
        medium: "paid_social",
        campaign: "satigny_duplex_launch",
        content: "carousel_a",
      },
    },
  },
  fullName: "Marie Dupont",
};

describe("paid-ads QA exclusion rule", () => {
  it("excludes the live Satigny QA smoke lead without relying on name alone", () => {
    const result = evaluatePaidAdsQaExclusion(LIVE_QA_LEAD);
    expect(result.excluded).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "reserved_email_domain",
        "zero_phone",
        "qa_utm_campaign",
        "qa_utm_content",
        "qa_notes",
      ]),
    );
  });

  it("keeps ordinary paid leads", () => {
    expect(isPaidAdsQaExcludedLead(ORDINARY_PAID_LEAD)).toBe(false);
    expect(evaluatePaidAdsQaExclusion(ORDINARY_PAID_LEAD).reasons).toEqual([]);
  });

  it("excludes reserved example.com email alone", () => {
    const result = evaluatePaidAdsQaExclusion({
      email: "ad-copilot-attribution-test@example.com",
      emailNormalized: "ad-copilot-attribution-test@example.com",
      phone: "+41791112233",
      notes: "Interested in Satigny",
      attributes: {
        integration: {
          utm: { campaign: "satigny_duplex_launch", content: "carousel_a" },
        },
      },
    });
    expect(result.excluded).toBe(true);
    expect(result.reasons).toEqual(["reserved_email_domain"]);
  });

  it("excludes explicit paidAdsAttribution.excludeFromOutcomes alone", () => {
    const result = evaluatePaidAdsQaExclusion({
      ...ORDINARY_PAID_LEAD,
      attributes: {
        ...ORDINARY_PAID_LEAD.attributes,
        ...buildPaidAdsAttributionExcludePolicy(),
      },
    });
    expect(result.excluded).toBe(true);
    expect(result.reasons).toContain("explicit_attribute");
  });

  it("does not exclude on TEST name alone when contact + utm look real", () => {
    const result = evaluatePaidAdsQaExclusion({
      email: "jean.martin@evahomes.ch",
      emailNormalized: "jean.martin@evahomes.ch",
      phone: "+41795556677",
      phoneNormalized: "41795556677",
      notes: "Please call after 18h",
      attributes: {
        integration: {
          utm: {
            source: "meta",
            medium: "paid_social",
            campaign: "satigny_duplex_launch",
            content: "video_1",
          },
        },
      },
    });
    expect(result.excluded).toBe(false);
    // Name is intentionally not part of the rule input.
    expect(result.reasons).toEqual([]);
  });

  it("does not treat 'Ne pas contacter' alone as QA", () => {
    expect(
      isPaidAdsQaExcludedLead({
        ...ORDINARY_PAID_LEAD,
        notes: "Ne pas contacter le soir",
      }),
    ).toBe(false);
  });

  it("does not treat ab_test / testimonial campaign names as QA", () => {
    expect(
      isPaidAdsQaExcludedLead({
        ...ORDINARY_PAID_LEAD,
        attributes: {
          integration: {
            utm: {
              campaign: "satigny_ab_test_variant",
              content: "testimonial_clip",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("excludes zero-only phones of length >= 6", () => {
    expect(
      isPaidAdsQaExcludedLead({
        email: "real@evahomes.ch",
        phoneNormalized: "0000000000",
      }),
    ).toBe(true);
  });

  it("builds kids-friendly exclusion notices", () => {
    expect(paidAdsQaExclusionNotice(0)).toBeNull();
    expect(paidAdsQaExclusionNotice(1)).toBe(
      "We hid 1 test form fill so it does not change your results.",
    );
    expect(paidAdsQaExclusionNotice(3)).toBe(
      "We hid 3 test form fills so they do not change your results.",
    );
  });
});

describe("summarizeProjectOutcomeFunnel QA filtering", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("ignores QA form_lead for counts, cost/form, and Ad Copilot advice", async () => {
    vi.stubEnv("ADVERTISING_ENABLED", "true");

    const findConversionEvents = vi.fn(async () => [
      {
        id: "ev-qa",
        workspaceId: "ws-a",
        projectId: "proj-1",
        growthCampaignId: "gc-1",
        leadId: "lead-qa",
        opportunityId: null,
        touchpointId: "tp-qa",
        milestone: "form_lead",
        value: null,
        currency: null,
        occurredAt: new Date("2026-10-05T10:00:00Z"),
        consentSnapshot: { granted: true },
        exportStatus: "pending",
        attributionModel: "last_touch",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "ev-real",
        workspaceId: "ws-a",
        projectId: "proj-1",
        growthCampaignId: "gc-1",
        leadId: "lead-real",
        opportunityId: null,
        touchpointId: "tp-real",
        milestone: "form_lead",
        value: null,
        currency: null,
        occurredAt: new Date("2026-10-05T11:00:00Z"),
        consentSnapshot: { granted: true },
        exportStatus: "pending",
        attributionModel: "last_touch",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const findLeadsByIds = vi.fn(async () => [
      {
        id: "lead-qa",
        email: LIVE_QA_LEAD.email,
        emailNormalized: LIVE_QA_LEAD.emailNormalized,
        phone: LIVE_QA_LEAD.phone,
        phoneNormalized: LIVE_QA_LEAD.phoneNormalized,
        notes: LIVE_QA_LEAD.notes,
        attributes: LIVE_QA_LEAD.attributes,
        fullName: LIVE_QA_LEAD.fullName,
      },
      {
        id: "lead-real",
        email: ORDINARY_PAID_LEAD.email,
        emailNormalized: ORDINARY_PAID_LEAD.emailNormalized,
        phone: ORDINARY_PAID_LEAD.phone,
        phoneNormalized: ORDINARY_PAID_LEAD.phoneNormalized,
        notes: ORDINARY_PAID_LEAD.notes,
        attributes: ORDINARY_PAID_LEAD.attributes,
        fullName: ORDINARY_PAID_LEAD.fullName,
      },
    ]);

    vi.doMock("@/server/repositories/conversion-events", () => ({
      findConversionEvents,
      createConversionEvent: vi.fn(),
    }));
    vi.doMock("@/server/repositories/leads", () => ({
      findLeadsByIds,
    }));
    vi.doMock("@/server/repositories/attribution-touchpoints", () => ({
      createAttributionTouchpoint: vi.fn(),
      findAttributionTouchpoints: vi.fn(async () => []),
    }));
    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns: vi.fn(async () => []),
    }));

    const { summarizeProjectOutcomeFunnel } = await import(
      "@/server/services/advertising-attribution"
    );

    const spend = 78;
    const outcomes = await summarizeProjectOutcomeFunnel("ws-a", "proj-1", spend);

    expect(findConversionEvents).toHaveBeenCalledWith("ws-a", { projectId: "proj-1" });
    expect(findLeadsByIds).toHaveBeenCalledWith("ws-a", expect.arrayContaining(["lead-qa", "lead-real"]));
    expect(outcomes.formLeads).toBe(1);
    expect(outcomes.qualifiedLeads).toBe(0);
    expect(outcomes.costPerFormLead).toBe(78);
    expect(outcomes.excludedTestLeads).toBe(1);
    expect(outcomes.exclusionNotice).toMatch(/hid 1 test form fill/i);

    const qaOnly = await summarizeProjectOutcomeFunnel("ws-a", "proj-1", spend);
    // Re-call with QA-only filter via fresh mock below would be cleaner; assert advice shape:
    const adviceWithOnlyQaExcluded = buildAdCopilotNextStep({
      freshness: "fresh",
      freshnessLabel: "Updated recently",
      spend: 78,
      clicks: 12,
      funnel: {
        formLeads: 0,
        qualifiedLeads: 0,
        opportunities: 0,
        wins: 0,
      },
    });
    expect(adviceWithOnlyQaExcluded.kind).toBe("check_landing_tracking");
    expect(adviceWithOnlyQaExcluded.kind).not.toBe("review_lead_quality");

    // Mixed retained form still suggests lead quality review (ordinary lead kept).
    const adviceMixed = buildAdCopilotNextStep({
      freshness: "fresh",
      freshnessLabel: "Updated recently",
      spend,
      clicks: 12,
      funnel: {
        formLeads: outcomes.formLeads,
        qualifiedLeads: outcomes.qualifiedLeads,
        opportunities: outcomes.opportunities,
        wins: outcomes.wonCount,
      },
    });
    expect(adviceMixed.kind).toBe("review_lead_quality");

    void qaOnly;
  });

  it("QA-only project funnel yields zero forms and null cost/form", async () => {
    vi.stubEnv("ADVERTISING_ENABLED", "true");

    vi.doMock("@/server/repositories/conversion-events", () => ({
      findConversionEvents: vi.fn(async () => [
        {
          id: "ev-qa",
          workspaceId: "ws-a",
          projectId: "proj-1",
          growthCampaignId: null,
          leadId: "lead-qa",
          opportunityId: null,
          touchpointId: null,
          milestone: "form_lead",
          value: null,
          currency: null,
          occurredAt: new Date(),
          consentSnapshot: { granted: true },
          exportStatus: "pending",
          attributionModel: "last_touch",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      createConversionEvent: vi.fn(),
    }));
    vi.doMock("@/server/repositories/leads", () => ({
      findLeadsByIds: vi.fn(async () => [
        {
          id: "lead-qa",
          ...LIVE_QA_LEAD,
        },
      ]),
    }));
    vi.doMock("@/server/repositories/attribution-touchpoints", () => ({
      createAttributionTouchpoint: vi.fn(),
      findAttributionTouchpoints: vi.fn(async () => []),
    }));
    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns: vi.fn(async () => []),
    }));

    const { summarizeProjectOutcomeFunnel } = await import(
      "@/server/services/advertising-attribution"
    );

    const outcomes = await summarizeProjectOutcomeFunnel("ws-a", "proj-1", 78);
    expect(outcomes.formLeads).toBe(0);
    expect(outcomes.costPerFormLead).toBeNull();
    expect(outcomes.excludedTestLeads).toBe(1);

    const advice = buildAdCopilotNextStep({
      freshness: "fresh",
      freshnessLabel: "Updated recently",
      spend: 78,
      clicks: 5,
      funnel: {
        formLeads: outcomes.formLeads,
        qualifiedLeads: outcomes.qualifiedLeads,
        opportunities: outcomes.opportunities,
        wins: outcomes.wonCount,
      },
    });
    expect(advice.kind).toBe("check_landing_tracking");
  });
});
