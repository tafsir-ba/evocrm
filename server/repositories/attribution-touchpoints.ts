import "server-only";

import {
  AttributionTouchpointModel,
  type AttributionTouchpointDocument,
} from "@/models/attribution-touchpoint";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { ConsentState } from "@/server/advertising/attribution/consent";
import { emptyConsentState } from "@/server/advertising/attribution/consent";

export type AttributionTouchpointRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  growthCampaignId: string | null;
  leadId: string | null;
  platform: string | null;
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
