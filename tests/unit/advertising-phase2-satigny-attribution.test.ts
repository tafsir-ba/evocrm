import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NEXTAUTH_SECRET: "test-nextauth-secret-for-credentials",
    INTEGRATION_API_KEY_PEPPER: undefined,
  })),
}));

import {
  COOKIE_CONSENT_NOTICE,
  COOKIE_CONSENT_VERSION,
  createAcceptedAdvertisingConsent,
  createDeclinedAdvertisingConsent,
  createManagedCookieConsent,
  isAdvertisingMeasurementAllowed,
} from "@/lib/cookie-consent";
import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import {
  canExportConversion,
  consentStateFromCookieConsent,
  emptyConsentState,
} from "@/server/advertising/attribution/consent";
import { evaluateConversionExportEligibility } from "@/server/repositories/conversion-events";
import { lastTouchAttributionLabel } from "@/server/services/advertising-attribution";
import { PUBLIC_PATHS } from "@/lib/public-paths";
import { websiteLeadCaptureInputSchema } from "@/server/validation/website-lead-capture";
import { resolveTrustedDestinationProjectId } from "@/server/advertising/routing/project-invariant";
import { META_READ_ONLY_SCOPES } from "@/lib/advertising-constants";

describe("Phase 2 cookie consent", () => {
  it("records version, timestamp, categories, and withdrawal on accept/decline", () => {
    const accepted = createAcceptedAdvertisingConsent(new Date("2026-10-05T12:00:00Z"));
    expect(accepted.version).toBe(COOKIE_CONSENT_VERSION);
    expect(accepted.decidedAt).toBe("2026-10-05T12:00:00.000Z");
    expect(accepted.categories.necessary).toBe(true);
    expect(accepted.categories.advertising).toBe(true);
    expect(accepted.withdrawn).toBe(false);
    expect(isAdvertisingMeasurementAllowed(accepted)).toBe(true);

    const declined = createDeclinedAdvertisingConsent(new Date("2026-10-05T12:00:00Z"));
    expect(declined.categories.advertising).toBe(false);
    expect(declined.withdrawn).toBe(true);
    expect(isAdvertisingMeasurementAllowed(declined)).toBe(false);
  });

  it("manage choices defaults advertising off and never treats necessary alone as ads consent", () => {
    const managedOff = createManagedCookieConsent({ advertising: false });
    expect(managedOff.categories.necessary).toBe(true);
    expect(isAdvertisingMeasurementAllowed(managedOff)).toBe(false);

    const managedOn = createManagedCookieConsent({ advertising: true });
    expect(isAdvertisingMeasurementAllowed(managedOn)).toBe(true);
  });

  it("maps cookie consent to ConsentState; declined blocks export eligibility", () => {
    const granted = consentStateFromCookieConsent(createAcceptedAdvertisingConsent(), {
      market: "CH",
    });
    expect(granted.granted).toBe(true);
    expect(granted.channel).toBe("pixel");
    expect(granted.purposes).toContain("advertising");
    expect(granted.purposes).toContain("conversion_export");
    expect(granted.market).toBe("CH");
    expect(canExportConversion(granted)).toBe(true);
    expect(evaluateConversionExportEligibility(granted)).toBe("pending");

    const denied = consentStateFromCookieConsent(createDeclinedAdvertisingConsent(), {
      market: "CH",
    });
    expect(denied.granted).toBe(false);
    expect(canExportConversion(denied)).toBe(false);
    expect(evaluateConversionExportEligibility(denied)).toBe("blocked_missing_consent");
    expect(evaluateConversionExportEligibility(emptyConsentState())).toBe(
      "blocked_missing_consent",
    );
  });

  it("mentions Meta measurement in the notice and exposes privacy path", () => {
    expect(COOKIE_CONSENT_NOTICE).toMatch(/Meta measurement/i);
    expect(PUBLIC_PATHS).toContain("/privacy-cookies");
  });
});

describe("Phase 2 Satigny attribution spine", () => {
  it("documents qualified lead as seeded lead_status.qualified", () => {
    expect(ADVERTISING_DEFAULTS.qualifiedLeadDefinition.statusKey).toBe("qualified");
    expect(ADVERTISING_DEFAULTS.qualifiedLeadDefinition.statusId).toBeNull();
    expect(ADVERTISING_DEFAULTS.attributionPolicyV1).toBe("last_touch");
  });

  it("labels last-touch attribution in plain language", () => {
    expect(lastTouchAttributionLabel()).toMatch(/last touch/i);
  });

  it("keeps Meta scopes read-only (no write)", () => {
    expect([...META_READ_ONLY_SCOPES]).toEqual(["ads_read", "business_management"]);
  });

  it("rejects browser project override against Growth Campaign lock", () => {
    expect(() =>
      resolveTrustedDestinationProjectId({
        growthCampaignProjectId: "proj-satigny",
        clientProjectId: "proj-other",
      }),
    ).toThrow(/cannot choose/i);

    expect(
      resolveTrustedDestinationProjectId({
        growthCampaignProjectId: "proj-satigny",
        clientProjectId: "proj-satigny",
      }),
    ).toBe("proj-satigny");
  });

  it("accepts fbclid + cookieConsent on website lead capture schema", () => {
    const parsed = websiteLeadCaptureInputSchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      fbclid: "IwAR0.test.click",
      landingPage: "https://evahomes.ch/satigny-duplex",
      utm: { source: "meta", medium: "paid", campaign: "satigny" },
      cookieConsent: createAcceptedAdvertisingConsent(),
      emailConsentStatus: "subscribed",
    });

    expect(parsed.fbclid).toBe("IwAR0.test.click");
    expect(parsed.cookieConsent?.categories.advertising).toBe(true);
    // Email consent remains a separate field — not advertising.
    expect(parsed.emailConsentStatus).toBe("subscribed");
  });

  it("business-first metric hierarchy stays ordered", () => {
    expect(ADVERTISING_DEFAULTS.successMetricHierarchy[0]).toBe(
      "won_value_roas_payback",
    );
    expect(ADVERTISING_DEFAULTS.successMetricHierarchy[4]).toBe(
      "clicks_cpc_ctr_cpm_media_only",
    );
  });
});

describe("Phase 2 advertising flag still defaults off", () => {
  const original = process.env.ADVERTISING_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADVERTISING_ENABLED;
    } else {
      process.env.ADVERTISING_ENABLED = original;
    }
  });

  it("does not enable advertising without env", async () => {
    delete process.env.ADVERTISING_ENABLED;
    const { isAdvertisingEnabled } = await import("@/lib/advertising-feature");
    expect(isAdvertisingEnabled()).toBe(false);
  });
});

describe("Phase 2 privacy gates on attribution writes", () => {
  const original = process.env.ADVERTISING_ENABLED;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/server/repositories/attribution-touchpoints");
    vi.doUnmock("@/server/repositories/conversion-events");
    vi.doUnmock("@/server/repositories/growth-campaigns");
    if (original === undefined) {
      delete process.env.ADVERTISING_ENABLED;
    } else {
      process.env.ADVERTISING_ENABLED = original;
    }
  });

  it("skips Meta measurement processing when consent declined or missing", async () => {
    process.env.ADVERTISING_ENABLED = "true";
    const createAttributionTouchpoint = vi.fn();
    const createConversionEvent = vi.fn();

    vi.doMock("@/server/repositories/attribution-touchpoints", () => ({
      createAttributionTouchpoint,
      findAttributionTouchpoints: vi.fn(async () => []),
    }));
    vi.doMock("@/server/repositories/conversion-events", () => ({
      createConversionEvent,
      findConversionEvents: vi.fn(async () => []),
      evaluateConversionExportEligibility: vi.fn(),
    }));
    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns: vi.fn(async () => [{ id: "gc-1" }]),
    }));

    const { recordPaidLeadTouchpointAndFormLead } = await import(
      "@/server/services/advertising-attribution"
    );

    await expect(
      recordPaidLeadTouchpointAndFormLead({
        workspaceId: "ws-1",
        projectId: "proj-1",
        leadId: "lead-1",
        clickId: "fb.clid",
        cookieConsent: createDeclinedAdvertisingConsent(),
      }),
    ).resolves.toBeNull();

    await expect(
      recordPaidLeadTouchpointAndFormLead({
        workspaceId: "ws-1",
        projectId: "proj-1",
        leadId: "lead-1",
        clickId: "fb.clid",
        cookieConsent: null,
      }),
    ).resolves.toBeNull();

    expect(createAttributionTouchpoint).not.toHaveBeenCalled();
    expect(createConversionEvent).not.toHaveBeenCalled();
  });

  it("no-ops attribution when advertising flag is off", async () => {
    delete process.env.ADVERTISING_ENABLED;
    const createAttributionTouchpoint = vi.fn();
    const createConversionEvent = vi.fn();

    vi.doMock("@/server/repositories/attribution-touchpoints", () => ({
      createAttributionTouchpoint,
      findAttributionTouchpoints: vi.fn(async () => []),
    }));
    vi.doMock("@/server/repositories/conversion-events", () => ({
      createConversionEvent,
      findConversionEvents: vi.fn(async () => []),
      evaluateConversionExportEligibility: vi.fn(),
    }));
    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns: vi.fn(async () => []),
    }));

    const { recordPaidLeadTouchpointAndFormLead, emitLifecycleConversionEvent } =
      await import("@/server/services/advertising-attribution");

    await expect(
      recordPaidLeadTouchpointAndFormLead({
        workspaceId: "ws-1",
        projectId: "proj-1",
        leadId: "lead-1",
        cookieConsent: createAcceptedAdvertisingConsent(),
      }),
    ).resolves.toBeNull();

    await expect(
      emitLifecycleConversionEvent({
        workspaceId: "ws-1",
        projectId: "proj-1",
        leadId: "lead-1",
        milestone: "qualified_lead",
      }),
    ).resolves.toBeNull();

    expect(createAttributionTouchpoint).not.toHaveBeenCalled();
    expect(createConversionEvent).not.toHaveBeenCalled();
  });

  it("requires an existing paid touchpoint for lifecycle milestones", async () => {
    process.env.ADVERTISING_ENABLED = "true";
    const createConversionEvent = vi.fn();

    vi.doMock("@/server/repositories/attribution-touchpoints", () => ({
      createAttributionTouchpoint: vi.fn(),
      findAttributionTouchpoints: vi.fn(async () => []),
    }));
    vi.doMock("@/server/repositories/conversion-events", () => ({
      createConversionEvent,
      findConversionEvents: vi.fn(async () => []),
      evaluateConversionExportEligibility: vi.fn(),
    }));
    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns: vi.fn(async () => [{ id: "gc-1", projectId: "proj-1" }]),
    }));

    const { emitLifecycleConversionEvent } = await import(
      "@/server/services/advertising-attribution"
    );

    await expect(
      emitLifecycleConversionEvent({
        workspaceId: "ws-1",
        projectId: "proj-1",
        leadId: "lead-organic",
        milestone: "qualified_lead",
      }),
    ).resolves.toBeNull();

    expect(createConversionEvent).not.toHaveBeenCalled();
  });

  it("honors withdrawal after accept (measurement not allowed)", () => {
    const withdrawn = createManagedCookieConsent({ advertising: false });
    expect(withdrawn.withdrawn).toBe(true);
    expect(isAdvertisingMeasurementAllowed(withdrawn)).toBe(false);
    expect(canExportConversion(consentStateFromCookieConsent(withdrawn))).toBe(false);
  });
});
