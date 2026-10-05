import "server-only";

import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import {
  isAdvertisingMeasurementAllowed,
  type CookieConsentRecord,
} from "@/lib/cookie-consent";
import type { AdPlatform } from "@/lib/advertising-constants";
import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import type { ConsentState } from "@/server/advertising/attribution/consent";
import {
  consentStateFromCookieConsent,
  emptyConsentState,
} from "@/server/advertising/attribution/consent";
import {
  createAttributionTouchpoint,
  findAttributionTouchpoints,
  type AttributionTouchpointRecord,
} from "@/server/repositories/attribution-touchpoints";
import {
  isPaidAdsQaExcludedLead,
  paidAdsQaExclusionNotice,
} from "@/lib/paid-ads-qa-exclusion";
import {
  createConversionEvent,
  findConversionEvents,
  type ConversionEventRecord,
  type ConversionMilestone,
} from "@/server/repositories/conversion-events";
import { findGrowthCampaigns } from "@/server/repositories/growth-campaigns";
import { findLeadsByIds } from "@/server/repositories/leads";

const LAST_TOUCH_LABEL = "Last touch — the most recent paid click gets the credit (v1)";

export function lastTouchAttributionLabel(): string {
  return LAST_TOUCH_LABEL;
}

export async function findLastTouchpointForLead(
  workspaceId: string,
  leadId: string,
): Promise<AttributionTouchpointRecord | null> {
  const rows = await findAttributionTouchpoints(workspaceId, { leadId });
  return rows[0] ?? null;
}

export async function resolvePilotGrowthCampaignForProject(
  workspaceId: string,
  projectId: string,
) {
  const campaigns = await findGrowthCampaigns(workspaceId, { projectId });
  return campaigns[0] ?? null;
}

export function buildConsentFromCookiePayload(
  cookieConsent: CookieConsentRecord | null | undefined,
): ConsentState {
  return consentStateFromCookieConsent(cookieConsent, {
    market: ADVERTISING_DEFAULTS.pilotSelection.countryCode,
  });
}

/**
 * Create paid touchpoint + form_lead only when:
 * - advertising feature flag is on, and
 * - visitor granted OPTIONAL advertising measurement (not declined/withdrawn/missing).
 * Never stores Meta click IDs when measurement is not allowed.
 */
export async function recordPaidLeadTouchpointAndFormLead(input: {
  workspaceId: string;
  projectId: string;
  leadId: string;
  growthCampaignId?: string | null;
  platform?: AdPlatform | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
  } | null;
  clickId?: string | null;
  landingPage?: string | null;
  cookieConsent?: CookieConsentRecord | null;
}): Promise<{
  touchpoint: AttributionTouchpointRecord;
  conversion: ConversionEventRecord;
} | null> {
  if (!isAdvertisingEnabled()) {
    return null;
  }

  if (!isAdvertisingMeasurementAllowed(input.cookieConsent ?? null)) {
    return null;
  }

  const consent = buildConsentFromCookiePayload(input.cookieConsent ?? null);
  const growthCampaignId =
    input.growthCampaignId ??
    (await resolvePilotGrowthCampaignForProject(input.workspaceId, input.projectId))
      ?.id ??
    null;

  const touchpoint = await createAttributionTouchpoint({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    growthCampaignId,
    leadId: input.leadId,
    platform: input.platform ?? (input.clickId ? "meta" : null),
    utmSource: input.utm?.source ?? null,
    utmMedium: input.utm?.medium ?? null,
    utmCampaign: input.utm?.campaign ?? null,
    utmTerm: input.utm?.term ?? null,
    utmContent: input.utm?.content ?? null,
    clickId: input.clickId ?? null,
    landingPage: input.landingPage ?? null,
    consent,
  });

  const conversion = await createConversionEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    growthCampaignId,
    leadId: input.leadId,
    touchpointId: touchpoint.id,
    milestone: "form_lead",
    consentSnapshot: consent,
    attributionModel: "last_touch",
  });

  return { touchpoint, conversion };
}

/**
 * Join CRM lifecycle into advertising outcomes only for leads that already have
 * a paid touchpoint (consented capture). Growth Campaign alone is not enough.
 */
export async function emitLifecycleConversionEvent(input: {
  workspaceId: string;
  projectId: string;
  leadId: string;
  opportunityId?: string | null;
  milestone: ConversionMilestone;
  value?: number | null;
  currency?: string | null;
  occurredAt?: Date;
}): Promise<ConversionEventRecord | null> {
  if (!isAdvertisingEnabled()) {
    return null;
  }

  const lastTouch = await findLastTouchpointForLead(input.workspaceId, input.leadId);
  if (!lastTouch) {
    return null;
  }

  const growth =
    (await resolvePilotGrowthCampaignForProject(input.workspaceId, input.projectId)) ??
    null;

  const consent = lastTouch.consent ?? emptyConsentState();
  const existing = await findConversionEvents(input.workspaceId, {
    leadId: input.leadId,
    milestone: input.milestone,
  });

  if (
    input.milestone === "qualified_lead" &&
    existing.some((row) => row.leadId === input.leadId)
  ) {
    return existing[0] ?? null;
  }

  if (
    input.opportunityId &&
    (input.milestone === "opportunity_created" ||
      input.milestone === "won" ||
      input.milestone === "lost")
  ) {
    const dup = existing.find((row) => row.opportunityId === input.opportunityId);
    if (dup) return dup;
  }

  return createConversionEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    growthCampaignId: growth?.id ?? lastTouch.growthCampaignId ?? null,
    leadId: input.leadId,
    opportunityId: input.opportunityId ?? null,
    touchpointId: lastTouch.id,
    milestone: input.milestone,
    value: input.value ?? null,
    currency: input.currency ?? null,
    occurredAt: input.occurredAt,
    consentSnapshot: consent,
    attributionModel: "last_touch",
  });
}

export async function summarizeProjectOutcomeFunnel(
  workspaceId: string,
  projectId: string,
  spend: number,
): Promise<{
  attributionModel: "last_touch";
  attributionLabel: string;
  formLeads: number;
  qualifiedLeads: number;
  opportunities: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  pipelineValue: number;
  costPerFormLead: number | null;
  costPerQualifiedLead: number | null;
  roas: number | null;
  /** Distinct leads skipped as QA / synthetic (do not affect costs or advice). */
  excludedTestLeads: number;
  /** Kids-friendly notice when exclusions applied; null otherwise. */
  exclusionNotice: string | null;
}> {
  const events = await findConversionEvents(workspaceId, { projectId });
  const leadIds = [
    ...new Set(
      events
        .map((event) => event.leadId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const leads = await findLeadsByIds(workspaceId, leadIds);
  const excludedLeadIds = new Set(
    leads
      .filter((lead) =>
        isPaidAdsQaExcludedLead({
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phone: lead.phone,
          phoneNormalized: lead.phoneNormalized,
          notes: lead.notes,
          attributes: lead.attributes,
        }),
      )
      .map((lead) => lead.id),
  );
  const counted = events.filter(
    (event) => !event.leadId || !excludedLeadIds.has(event.leadId),
  );

  const formLeads = counted.filter((e) => e.milestone === "form_lead").length;
  const qualifiedLeads = counted.filter((e) => e.milestone === "qualified_lead").length;
  const opportunities = counted.filter((e) => e.milestone === "opportunity_created").length;
  const wonEvents = counted.filter((e) => e.milestone === "won");
  const lostCount = counted.filter((e) => e.milestone === "lost").length;
  const wonValue = wonEvents.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
  const pipelineValue = counted
    .filter((e) => e.milestone === "opportunity_created")
    .reduce((sum, e) => sum + (Number(e.value) || 0), 0);
  const excludedTestLeads = excludedLeadIds.size;

  return {
    attributionModel: "last_touch",
    attributionLabel: LAST_TOUCH_LABEL,
    formLeads,
    qualifiedLeads,
    opportunities,
    wonCount: wonEvents.length,
    lostCount,
    wonValue,
    pipelineValue,
    costPerFormLead: formLeads > 0 ? spend / formLeads : null,
    costPerQualifiedLead: qualifiedLeads > 0 ? spend / qualifiedLeads : null,
    roas: spend > 0 && wonValue > 0 ? wonValue / spend : null,
    excludedTestLeads,
    exclusionNotice: paidAdsQaExclusionNotice(excludedTestLeads),
  };
}
