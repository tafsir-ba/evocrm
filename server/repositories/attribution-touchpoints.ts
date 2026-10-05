import "server-only";

import {
  AttributionTouchpointModel,
  type AttributionTouchpointDocument,
} from "@/models/attribution-touchpoint";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { ConsentState } from "@/server/advertising/attribution/consent";
import { emptyConsentState } from "@/server/advertising/attribution/consent";
import type { AdPlatform } from "@/lib/advertising-constants";

export type AttributionTouchpointRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  growthCampaignId: string | null;
  leadId: string | null;
  platform: string | null;
  adAccountId: string | null;
  externalCampaignId: string | null;
  externalAdGroupId: string | null;
  externalAdId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  landingPage: string | null;
  consent: ConsentState;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function toConsent(raw: AttributionTouchpointDocument["consent"]): ConsentState {
  if (!raw) {
    return emptyConsentState();
  }
  return {
    granted: Boolean(raw.granted),
    channel: (raw.channel as ConsentState["channel"]) ?? null,
    purposes: [...(raw.purposes ?? [])] as ConsentState["purposes"],
    policyVersion: raw.policyVersion ?? null,
    capturedAt: raw.capturedAt ?? null,
    market: raw.market ?? null,
  };
}

function toRecord(document: AttributionTouchpointDocument): AttributionTouchpointRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    growthCampaignId: document.growthCampaignId?.toString() ?? null,
    leadId: document.leadId?.toString() ?? null,
    platform: document.platform ?? null,
    adAccountId: document.adAccountId?.toString() ?? null,
    externalCampaignId: document.externalCampaignId ?? null,
    externalAdGroupId: document.externalAdGroupId ?? null,
    externalAdId: document.externalAdId ?? null,
    utmSource: document.utmSource ?? null,
    utmMedium: document.utmMedium ?? null,
    utmCampaign: document.utmCampaign ?? null,
    utmContent: document.utmContent ?? null,
    utmTerm: document.utmTerm ?? null,
    clickId: document.clickId ?? null,
    landingPage: document.landingPage ?? null,
    consent: toConsent(document.consent),
    capturedAt: document.capturedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findAttributionTouchpoints(
  workspaceId: string,
  filter: { leadId?: string; projectId?: string } = {},
): Promise<AttributionTouchpointRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (filter.leadId) {
    query.leadId = filter.leadId;
  }
  if (filter.projectId) {
    query.projectId = filter.projectId;
  }

  const documents = await AttributionTouchpointModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ capturedAt: -1 })
    .lean<AttributionTouchpointDocument[]>();

  return documents.map(toRecord);
}

export async function createAttributionTouchpoint(input: {
  workspaceId: string;
  projectId: string;
  growthCampaignId?: string | null;
  leadId?: string | null;
  platform?: AdPlatform | null;
  adAccountId?: string | null;
  externalCampaignId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  clickId?: string | null;
  landingPage?: string | null;
  consent?: ConsentState;
  capturedAt?: Date;
}): Promise<AttributionTouchpointRecord> {
  await connectDb();
  const document = await AttributionTouchpointModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    growthCampaignId: input.growthCampaignId ?? null,
    leadId: input.leadId ?? null,
    platform: input.platform ?? null,
    adAccountId: input.adAccountId ?? null,
    externalCampaignId: input.externalCampaignId ?? null,
    externalAdGroupId: input.externalAdGroupId ?? null,
    externalAdId: input.externalAdId ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    utmContent: input.utmContent ?? null,
    utmTerm: input.utmTerm ?? null,
    clickId: input.clickId ?? null,
    landingPage: input.landingPage ?? null,
    consent: input.consent ?? emptyConsentState(),
    capturedAt: input.capturedAt ?? new Date(),
  });

  return toRecord(document.toObject());
}
