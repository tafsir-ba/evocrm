import "server-only";

import {
  ConversionEventModel,
  type ConversionEventDocument,
} from "@/models/conversion-event";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { ConsentState } from "@/server/advertising/attribution/consent";
import {
  canExportConversion,
  emptyConsentState,
} from "@/server/advertising/attribution/consent";

export type ConversionEventRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  leadId: string | null;
  opportunityId: string | null;
  touchpointId: string | null;
  milestone: string;
  value: number | null;
  currency: string | null;
  occurredAt: Date;
  consentSnapshot: ConsentState;
  exportStatus: string;
  attributionModel: string;
  createdAt: Date;
  updatedAt: Date;
};

function toConsent(raw: ConversionEventDocument["consentSnapshot"]): ConsentState {
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

function toRecord(document: ConversionEventDocument): ConversionEventRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    leadId: document.leadId?.toString() ?? null,
    opportunityId: document.opportunityId?.toString() ?? null,
    touchpointId: document.touchpointId?.toString() ?? null,
    milestone: document.milestone,
    value: document.value ?? null,
    currency: document.currency ?? null,
    occurredAt: document.occurredAt,
    consentSnapshot: toConsent(document.consentSnapshot),
    exportStatus: document.exportStatus,
    attributionModel: document.attributionModel,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findConversionEvents(
  workspaceId: string,
  filter: { projectId?: string; leadId?: string } = {},
): Promise<ConversionEventRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (filter.projectId) {
    query.projectId = filter.projectId;
  }
  if (filter.leadId) {
    query.leadId = filter.leadId;
  }

  const documents = await ConversionEventModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ occurredAt: -1 })
    .lean<ConversionEventDocument[]>();

  return documents.map(toRecord);
}

/** Phase 0 stub — export blocked without consent. */
export function evaluateConversionExportEligibility(
  consent: ConsentState,
): "pending" | "blocked_missing_consent" {
  return canExportConversion(consent) ? "pending" : "blocked_missing_consent";
}
