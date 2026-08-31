import "server-only";

import {
  MARKET_INCOME_DISCLAIMER,
  emptyFinancialSnapshot,
  hasOccupationalEstimateInputs,
  parseOccupationalEstimatePayload,
  parseOccupationalWageRange,
  type LeadFinancialSituationSnapshot,
  type MarketIncomeEstimate,
} from "@/lib/lead-financial-situation";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findCompaniesByIds } from "@/server/repositories/companies";
import { findLeadById } from "@/server/repositories/leads";
import {
  findFinancialSituationForLead,
  saveMarketIncomeEstimate,
  softDeleteFinancialSituation,
  upsertFinancialSituation,
  type LeadFinancialSituationRecord,
} from "@/server/repositories/lead-financial-situation";
import { getLeadEnrichmentCapability } from "@/server/services/lead-enrichment";
import {
  enrichmentOpenAiModel,
  liveEnrichmentProviders,
} from "@/server/services/lead-enrichment-providers";
import { getEnv } from "@/server/env";

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
  const jobTitle = lead.jobTitle?.trim();
  if (!hasOccupationalEstimateInputs(lead) || !jobTitle) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Market-income estimate needs a job title and a location (city, region, or country).",
    );
  }
  const location = [lead.city, lead.stateRegion, lead.country].filter(Boolean).join(", ");
  const companies = lead.companyId
    ? await findCompaniesByIds(input.workspaceId, [lead.companyId])
    : [];
  const companyName = companies[0]?.name?.trim() || null;

  let sources: Array<{ url: string; title: string }> = [];
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;
  let methodology =
    "Occupational estimate: typical pay for this role and market, not this person’s income.";
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
    const likeCompany = companyName ? ` at a company like ${companyName}` : "";
    const search = await liveEnrichmentProviders.search(
      `typical annual salary compensation range "${jobTitle}"${likeCompany} ${location}`,
      ["news_press", "professional_registry"],
    );
    provider = search.provider;
    const parsed = parseOccupationalWageRange(search.hits);
    if (parsed) {
      rangeMin = parsed.rangeMin;
      rangeMax = parsed.rangeMax;
      sources = parsed.sources;
      confidencePercent = Math.min(40 + parsed.sources.length * 5, 60);
      methodology = `${methodology} Numbers taken from ${parsed.sources.length} retrieved public snippet(s).`;
    } else {
      const synthesized = await synthesizeOccupationalWageEstimate({
        jobTitle,
        location,
        companyName,
        currency: input.defaultCurrency,
      });
      if (!synthesized) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Could not form an occupational pay estimate for this role and location.",
        );
      }
      rangeMin = synthesized.rangeMin;
      rangeMax = synthesized.rangeMax;
      confidencePercent = synthesized.confidencePercent;
      methodology = `${synthesized.methodology} Labelled occupational estimate only — not this person’s income.`;
      model = enrichmentOpenAiModel();
      sources = search.hits
        .filter((hit) => hit.url.startsWith("https://"))
        .slice(0, 4)
        .map((hit) => ({ url: hit.url, title: hit.title }));
    }
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

async function synthesizeOccupationalWageEstimate(input: {
  jobTitle: string;
  location: string;
  companyName: string | null;
  currency: string;
}): Promise<{
  rangeMin: number;
  rangeMax: number;
  methodology: string;
  confidencePercent: number;
} | null> {
  const key = getEnv().OPENAI_API_KEY;
  if (!key) {
    return null;
  }
  const model = enrichmentOpenAiModel();
  const company = input.companyName ? ` at a company like ${input.companyName}` : "";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You estimate typical occupational pay bands for internal CRM research. Never claim this is a specific person’s income.",
        },
        {
          role: "user",
          content: `What is a typical annual compensation range in ${input.currency} for a "${input.jobTitle}"${company} in ${input.location}? This is an occupational market estimate, not personal finances.

Return JSON only:
{"rangeMin":number,"rangeMax":number,"confidencePercent":20-55,"methodology":"short string"}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  try {
    return parseOccupationalEstimatePayload(JSON.parse(content) as unknown);
  } catch {
    return null;
  }
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
    prefillWorkingFigures: false,
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

