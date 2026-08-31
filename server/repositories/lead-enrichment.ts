import "server-only";

import { randomUUID } from "crypto";

import type { LeadEnrichmentIdentityMatch } from "@/lib/lead-enrichment";
import type { LeadEnrichmentSuggestion } from "@/lib/lead-enrichment";
import type { LeadEnrichmentSummary } from "@/lib/lead-enrichment";
import type { LeadEnrichmentSearchHit } from "@/lib/lead-enrichment";
import { DEFAULT_ENRICHMENT_RETENTION_DAYS } from "@/lib/lead-enrichment";
import type { LeadEnrichmentRunStatus } from "@/lib/lead-enrichment";
import { connectDb } from "@/server/db/mongoose";
import { LeadEnrichmentRunModel } from "@/models/lead-enrichment-run";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { AppError } from "@/server/errors";

export type LeadEnrichmentRunRecord = {
  id: string;
  workspaceId: string;
  leadId: string;
  initiatedBy: string;
  status: LeadEnrichmentRunStatus;
  queryFullName: string;
  queryEmail: string;
  allowedSources: string[];
  searchProvider: string | null;
  aiModel: string | null;
  retrievedAt: string | null;
  expiresAt: string | null;
  identityMatch: LeadEnrichmentIdentityMatch | null;
  identityRationale: string | null;
  failureMessage: string | null;
  demoMode: boolean;
  sources: LeadEnrichmentSearchHit[];
  suggestions: LeadEnrichmentSuggestion[];
  summaryDraft: LeadEnrichmentSummary | null;
  acceptedSummary: LeadEnrichmentSummary | null;
  revokedAt: string | null;
  revokedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRecord(document: {
  _id: { toString(): string };
  workspaceId: { toString(): string };
  leadId: { toString(): string };
  initiatedBy: { toString(): string };
  status: string;
  queryFullName: string;
  queryEmail: string;
  allowedSources?: string[];
  searchProvider?: string | null;
  aiModel?: string | null;
  retrievedAt?: Date | null;
  expiresAt?: Date | null;
  identityMatch?: string | null;
  identityRationale?: string | null;
  failureMessage?: string | null;
  demoMode?: boolean;
  sources?: LeadEnrichmentSearchHit[];
  suggestions?: LeadEnrichmentSuggestion[];
  summaryDraft?: LeadEnrichmentSummary | null;
  acceptedSummary?: LeadEnrichmentSummary | null;
  revokedAt?: Date | null;
  revokedBy?: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
}): LeadEnrichmentRunRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    leadId: document.leadId.toString(),
    initiatedBy: document.initiatedBy.toString(),
    status: document.status as LeadEnrichmentRunStatus,
    queryFullName: document.queryFullName,
    queryEmail: document.queryEmail,
    allowedSources: document.allowedSources ?? [],
    searchProvider: document.searchProvider ?? null,
    aiModel: document.aiModel ?? null,
    retrievedAt: document.retrievedAt ? document.retrievedAt.toISOString() : null,
    expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
    identityMatch: (document.identityMatch as LeadEnrichmentIdentityMatch | null) ?? null,
    identityRationale: document.identityRationale ?? null,
    failureMessage: document.failureMessage ?? null,
    demoMode: document.demoMode === true,
    sources: document.sources ?? [],
    suggestions: document.suggestions ?? [],
    summaryDraft: document.summaryDraft ?? null,
    acceptedSummary: document.acceptedSummary ?? null,
    revokedAt: document.revokedAt ? document.revokedAt.toISOString() : null,
    revokedBy: document.revokedBy ? document.revokedBy.toString() : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function newSuggestionId(): string {
  return randomUUID();
}

export async function createEnrichmentRun(input: {
  workspaceId: string;
  leadId: string;
  initiatedBy: string;
  queryFullName: string;
  queryEmail: string;
  allowedSources: string[];
  demoMode: boolean;
  retentionDays?: number;
}): Promise<LeadEnrichmentRunRecord> {
  await connectDb();
  const retentionDays = input.retentionDays ?? DEFAULT_ENRICHMENT_RETENTION_DAYS;
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  const document = await LeadEnrichmentRunModel.create({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    initiatedBy: input.initiatedBy,
    status: "searching",
    queryFullName: input.queryFullName,
    queryEmail: input.queryEmail,
    allowedSources: input.allowedSources,
    demoMode: input.demoMode,
    expiresAt,
  });
  return toRecord(document.toObject() as never);
}

export async function findEnrichmentRunById(
  workspaceId: string,
  runId: string,
): Promise<LeadEnrichmentRunRecord | null> {
  await connectDb();
  const document = await LeadEnrichmentRunModel.findOne(
    withWorkspaceScope(workspaceId, { _id: runId }),
  ).lean();
  return document ? toRecord(document as never) : null;
}

export async function listEnrichmentRunsForLead(
  workspaceId: string,
  leadId: string,
  limit = 20,
): Promise<LeadEnrichmentRunRecord[]> {
  await connectDb();
  const documents = await LeadEnrichmentRunModel.find(
    withWorkspaceScope(workspaceId, { leadId }),
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return documents.map((document) => toRecord(document as never));
}

export async function updateEnrichmentRun(
  workspaceId: string,
  runId: string,
  patch: Partial<{
    status: LeadEnrichmentRunStatus;
    searchProvider: string | null;
    aiModel: string | null;
    retrievedAt: Date | null;
    identityMatch: LeadEnrichmentIdentityMatch | null;
    identityRationale: string | null;
    failureMessage: string | null;
    sources: LeadEnrichmentSearchHit[];
    suggestions: LeadEnrichmentSuggestion[];
    summaryDraft: LeadEnrichmentSummary | null;
    acceptedSummary: LeadEnrichmentSummary | null;
    revokedAt: Date | null;
    revokedBy: string | null;
  }>,
): Promise<LeadEnrichmentRunRecord> {
  await connectDb();
  const document = await LeadEnrichmentRunModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: runId }),
    { $set: patch },
    { new: true },
  ).lean();
  if (!document) {
    throw new AppError("NOT_FOUND", "Enrichment run not found.");
  }
  return toRecord(document as never);
}

export async function revokeEnrichmentRunsForLead(
  workspaceId: string,
  leadId: string,
  actorId: string,
): Promise<number> {
  await connectDb();
  const result = await LeadEnrichmentRunModel.updateMany(
    withWorkspaceScope(workspaceId, { leadId, revokedAt: null }),
    {
      $set: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: actorId,
      },
    },
  );
  return result.modifiedCount;
}
