import "server-only";

import type {
  LeadFinancialSituationSnapshot,
  MarketIncomeEstimate,
} from "@/lib/lead-financial-situation";
import { emptyFinancialSnapshot } from "@/lib/lead-financial-situation";
import { connectDb } from "@/server/db/mongoose";
import { LeadFinancialSituationModel } from "@/models/lead-financial-situation";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { AppError } from "@/server/errors";

export type FinancialRevision = {
  at: string;
  actorId: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type LeadFinancialSituationRecord = LeadFinancialSituationSnapshot & {
  id: string;
  workspaceId: string;
  leadId: string;
  marketIncomeEstimate: MarketIncomeEstimate | null;
  revisions: FinancialRevision[];
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRecord(document: {
  _id: { toString(): string };
  workspaceId: { toString(): string };
  leadId: { toString(): string };
  declaredAnnualIncome?: number | null;
  employmentType?: string | null;
  availableDepositEquity?: number | null;
  targetPurchasePrice?: number | null;
  financingNeed?: number | null;
  existingCommitments?: string | null;
  affordabilityNotes?: string | null;
  currency: string;
  source?: string | null;
  asOfDate?: string | null;
  confidence?: string | null;
  assessorNotes?: string | null;
  marketIncomeEstimate?: MarketIncomeEstimate | null;
  revisions?: FinancialRevision[];
  createdBy: { toString(): string };
  updatedBy: { toString(): string };
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LeadFinancialSituationRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    leadId: document.leadId.toString(),
    declaredAnnualIncome: document.declaredAnnualIncome ?? null,
    employmentType: (document.employmentType as LeadFinancialSituationRecord["employmentType"]) ?? null,
    availableDepositEquity: document.availableDepositEquity ?? null,
    targetPurchasePrice: document.targetPurchasePrice ?? null,
    financingNeed: document.financingNeed ?? null,
    existingCommitments: document.existingCommitments ?? null,
    affordabilityNotes: document.affordabilityNotes ?? null,
    currency: document.currency,
    source: (document.source as LeadFinancialSituationRecord["source"]) ?? null,
    asOfDate: document.asOfDate ?? null,
    confidence: (document.confidence as LeadFinancialSituationRecord["confidence"]) ?? null,
    assessorNotes: document.assessorNotes ?? null,
    marketIncomeEstimate: document.marketIncomeEstimate ?? null,
    revisions: document.revisions ?? [],
    createdBy: document.createdBy.toString(),
    updatedBy: document.updatedBy.toString(),
    deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function findFinancialSituationForLead(
  workspaceId: string,
  leadId: string,
  includeDeleted = false,
): Promise<LeadFinancialSituationRecord | null> {
  await connectDb();
  const filter = includeDeleted
    ? withWorkspaceScope(workspaceId, { leadId })
    : withWorkspaceScope(workspaceId, { leadId, deletedAt: null });
  const document = await LeadFinancialSituationModel.findOne(filter).lean();
  return document ? toRecord(document as never) : null;
}

export async function upsertFinancialSituation(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  snapshot: LeadFinancialSituationSnapshot;
  marketIncomeEstimate?: MarketIncomeEstimate | null;
  revision: FinancialRevision;
}): Promise<LeadFinancialSituationRecord> {
  await connectDb();
  const existing = await LeadFinancialSituationModel.findOne(
    withWorkspaceScope(input.workspaceId, { leadId: input.leadId }),
  );
  if (!existing) {
    const created = await LeadFinancialSituationModel.create({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      ...input.snapshot,
      marketIncomeEstimate: input.marketIncomeEstimate ?? null,
      revisions: [input.revision],
      createdBy: input.actorId,
      updatedBy: input.actorId,
      deletedAt: null,
    });
    return toRecord(created.toObject() as never);
  }

  existing.set({
    ...input.snapshot,
    ...(input.marketIncomeEstimate !== undefined
      ? { marketIncomeEstimate: input.marketIncomeEstimate }
      : {}),
    updatedBy: input.actorId,
    deletedAt: null,
    deletedBy: null,
  });
  const revisions = [...((existing.revisions as FinancialRevision[]) ?? []), input.revision];
  existing.set("revisions", revisions.slice(-50));
  await existing.save();
  return toRecord(existing.toObject() as never);
}

export async function saveMarketIncomeEstimate(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  currency: string;
  estimate: MarketIncomeEstimate;
}): Promise<LeadFinancialSituationRecord> {
  const existing = await findFinancialSituationForLead(input.workspaceId, input.leadId);
  const snapshot = existing
    ? {
        declaredAnnualIncome: existing.declaredAnnualIncome,
        employmentType: existing.employmentType,
        availableDepositEquity: existing.availableDepositEquity,
        targetPurchasePrice: existing.targetPurchasePrice,
        financingNeed: existing.financingNeed,
        existingCommitments: existing.existingCommitments,
        affordabilityNotes: existing.affordabilityNotes,
        currency: existing.currency,
        source: existing.source,
        asOfDate: existing.asOfDate,
        confidence: existing.confidence,
        assessorNotes: existing.assessorNotes,
      }
    : emptyFinancialSnapshot(input.currency);
  return upsertFinancialSituation({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    actorId: input.actorId,
    snapshot,
    marketIncomeEstimate: input.estimate,
    revision: {
      at: new Date().toISOString(),
      actorId: input.actorId,
      action: "market_income_estimate",
      before: { marketIncomeEstimate: existing?.marketIncomeEstimate ?? null },
      after: { marketIncomeEstimate: input.estimate },
    },
  });
}

export async function softDeleteFinancialSituation(
  workspaceId: string,
  leadId: string,
  actorId: string,
): Promise<LeadFinancialSituationRecord | null> {
  await connectDb();
  const document = await LeadFinancialSituationModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { leadId, deletedAt: null }),
    {
      $set: { deletedAt: new Date(), deletedBy: actorId, updatedBy: actorId },
      $push: {
        revisions: {
          at: new Date().toISOString(),
          actorId,
          action: "deleted",
          before: {},
          after: { deletedAt: true },
        },
      },
    },
    { new: true },
  ).lean();
  return document ? toRecord(document as never) : null;
}
