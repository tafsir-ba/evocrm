import "server-only";

import {
  MARKET_INCOME_DISCLAIMER,
  emptyFinancialSnapshot,
  parseOccupationalWageRange,
  type LeadFinancialSituationSnapshot,
  type MarketIncomeEstimate,
} from "@/lib/lead-financial-situation";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findLeadById } from "@/server/repositories/leads";
import {
  findFinancialSituationForLead,
  saveMarketIncomeEstimate,
  softDeleteFinancialSituation,
  upsertFinancialSituation,
  type LeadFinancialSituationRecord,
} from "@/server/repositories/lead-financial-situation";
import { getLeadEnrichmentCapability } from "@/server/services/lead-enrichment";
import { liveEnrichmentProviders } from "@/server/services/lead-enrichment-providers";

export async function getFinancialSituationForLead(
  workspaceId: string,
  leadId: string,
  defaultCurrency: string,
): Promise<{
  record: LeadFinancialSituationRecord | null;
  snapshot: LeadFinancialSituationSnapshot;
  disclaimer: string;
}> {
  const lead = await findLeadById(workspaceId, leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const record = await findFinancialSituationForLead(workspaceId, leadId);
  return {
    record,
    snapshot: record
      ? {
          declaredAnnualIncome: record.declaredAnnualIncome,
          employmentType: record.employmentType,
          availableDepositEquity: record.availableDepositEquity,
          targetPurchasePrice: record.targetPurchasePrice,
          financingNeed: record.financingNeed,
          existingCommitments: record.existingCommitments,
          affordabilityNotes: record.affordabilityNotes,
          currency: record.currency,
          source: record.source,
          asOfDate: record.asOfDate,
          confidence: record.confidence,
          assessorNotes: record.assessorNotes,
        }
      : emptyFinancialSnapshot(defaultCurrency),
    disclaimer: MARKET_INCOME_DISCLAIMER,
  };
}

export async function updateFinancialSituationForLead(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  snapshot: LeadFinancialSituationSnapshot;
}): Promise<LeadFinancialSituationRecord> {
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const existing = await findFinancialSituationForLead(input.workspaceId, input.leadId);
  const record = await upsertFinancialSituation({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    actorId: input.actorId,
    snapshot: input.snapshot,
    revision: {
      at: new Date().toISOString(),
      actorId: input.actorId,
      action: existing ? "updated" : "created",
      before: existing
        ? {
            declaredAnnualIncome: existing.declaredAnnualIncome,
            employmentType: existing.employmentType,
          }
        : {},
      after: {
        declaredAnnualIncome: input.snapshot.declaredAnnualIncome,
        employmentType: input.snapshot.employmentType,
      },
    },
  });
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.financial_situation_updated",
    entityType: "lead_financial_situation",
    entityId: record.id,
    after: {
      leadId: input.leadId,
      source: input.snapshot.source,
      asOfDate: input.snapshot.asOfDate,
    },
  });
  return record;
}

export async function requestMarketIncomeEstimate(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  defaultCurrency: string;
}): Promise<LeadFinancialSituationRecord> {
  const capability = await getLeadEnrichmentCapability(input.workspaceId);
  if (!capability.enabled) {
    throw new AppError(
      "VALIDATION_ERROR",
      capability.reasonDisabled ?? "Market-income estimate requires enrichment to be enabled.",
    );
  }
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const location = [lead.city, lead.stateRegion, lead.country].filter(Boolean).join(", ");
  const jobTitle = lead.jobTitle?.trim();
  if (!jobTitle || !location) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Market-income estimate needs a job title and a location (city, region, or country).",
    );
  }

  let sources: Array<{ url: string; title: string }> = [];
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;
  let methodology =
    "Occupational public wage-band search for the job title and location only. Not a personal income finding. Numbers are taken from retrieved https snippets, not invented.";
  let confidencePercent = 40;
  let provider = "demo_fixture";
  let model = "none";
  let demoMode = capability.demoMode;

  if (capability.demoMode) {
    rangeMin = 80000;
    rangeMax = 140000;
    methodology =
      "Demo fixture occupational placeholder for this job title and location. Not live market data and not a personal income finding.";
    confidencePercent = 40;
    sources = [
      {
        url: "https://www.example.com/occupational-wages",
        title: "Demo occupational wage table",
      },
    ];
  } else {
    const search = await liveEnrichmentProviders.search(
      `typical salary range "${jobTitle}" ${location} occupational statistics`,
      ["news_press", "professional_registry"],
    );
    provider = search.provider;
    const parsed = parseOccupationalWageRange(search.hits);
    if (!parsed) {
      throw new AppError(
        "VALIDATION_ERROR",
        "No cited occupational wage range was found for this job and location. No estimate was stored.",
      );
    }
    rangeMin = parsed.rangeMin;
    rangeMax = parsed.rangeMax;
    sources = parsed.sources;
    confidencePercent = Math.min(40 + parsed.sources.length * 5, 60);
    methodology = `${methodology} Retrieved ${parsed.sources.length} cited source(s).`;
  }

  const estimate: MarketIncomeEstimate = {
    rangeMin,
    rangeMax,
    currency: input.defaultCurrency,
    methodology,
    sources,
    confidencePercent,
    jobTitleUsed: jobTitle,
    locationUsed: location,
    retrievedAt: new Date().toISOString(),
    aiModel: model,
    searchProvider: provider,
    demoMode,
    reviewed: false,
    reviewedBy: null,
    reviewedAt: null,
    disclaimer: MARKET_INCOME_DISCLAIMER,
  };

  const record = await saveMarketIncomeEstimate({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    actorId: input.actorId,
    currency: input.defaultCurrency,
    estimate,
  });
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.financial_market_estimate",
    entityType: "lead_financial_situation",
    entityId: record.id,
    after: {
      leadId: input.leadId,
      jobTitle,
      location,
      disclaimer: MARKET_INCOME_DISCLAIMER,
    },
  });
  return record;
}

export async function markMarketIncomeReviewed(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
}): Promise<LeadFinancialSituationRecord> {
  const existing = await findFinancialSituationForLead(input.workspaceId, input.leadId);
  if (!existing?.marketIncomeEstimate) {
    throw new AppError("NOT_FOUND", "No market-income estimate to review.");
  }
  const estimate: MarketIncomeEstimate = {
    ...existing.marketIncomeEstimate,
    reviewed: true,
    reviewedBy: input.actorId,
    reviewedAt: new Date().toISOString(),
  };
  return saveMarketIncomeEstimate({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    actorId: input.actorId,
    currency: existing.currency,
    estimate,
  });
}

export async function deleteFinancialSituationForLead(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
}): Promise<void> {
  const deleted = await softDeleteFinancialSituation(
    input.workspaceId,
    input.leadId,
    input.actorId,
  );
  if (!deleted) {
    throw new AppError("NOT_FOUND", "Financial situation not found.");
  }
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.financial_situation_deleted",
    entityType: "lead_financial_situation",
    entityId: deleted.id,
    after: { leadId: input.leadId },
  });
}

