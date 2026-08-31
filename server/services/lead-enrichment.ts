import "server-only";

import {
  LEAD_ENRICHMENT_ALLOWED_SOURCES,
  LEAD_ENRICHMENT_FIELD_KEYS,
  WEB_ENRICHMENT_METHOD,
  WEB_ENRICHMENT_SIDE_EFFECT_GUARD,
  WEB_ENRICHMENT_SOURCE,
  clampConfidence,
  contentLooksExcluded,
  crmValueRequiresOverwrite,
  isSafeToAutoApplySuggestion,
  citeOnlyRetrievedUrls,
  isLeadEnrichmentFieldKey,
  mergeWebEnrichmentAttributes,
  readWebEnrichmentAttributes,
  sanitizeEnrichmentText,
  type LeadEnrichmentAllowedSource,
  type LeadEnrichmentFieldKey,
  type LeadEnrichmentSuggestion,
  type LeadEnrichmentSummary,
} from "@/lib/lead-enrichment";
import {
  buildLeadFieldProvenance,
  mergeIntelligenceProvenance,
  type LeadFieldProvenance,
  type LeadFieldProvenanceMethod,
  type LeadIntelligenceProvenance,
} from "@/lib/lead-intelligence";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { getLeadEnrichmentDemoFixture } from "@/lib/lead-enrichment-demo";
import {
  createEnrichmentRun,
  findEnrichmentRunById,
  listEnrichmentRunsForLead,
  newSuggestionId,
  revokeEnrichmentRunsForLead,
  updateEnrichmentRun,
  type LeadEnrichmentRunRecord,
} from "@/server/repositories/lead-enrichment";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import { findWorkspaceById, updateWorkspace } from "@/server/repositories/workspaces";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  isDemoEnvEnabled,
  isOpenAiConfigured,
  isSearchConfigured,
  liveEnrichmentProviders,
  type EnrichmentProviders,
} from "@/server/services/lead-enrichment-providers";
import { findCompaniesByIds } from "@/server/repositories/companies";
import { syncSystemRolePermissionsForWorkspace } from "@/server/services/roles";

export { isOpenAiConfigured, isSearchConfigured };

function asOrigin(
  provenance: LeadFieldProvenance | null | undefined,
): LeadFieldProvenanceMethod | "unknown" | null {
  return provenance?.method ?? null;
}

async function currentFieldMap(lead: NonNullable<Awaited<ReturnType<typeof findLeadById>>>): Promise<{
  values: Record<LeadEnrichmentFieldKey, string | null>;
  origins: Record<LeadEnrichmentFieldKey, LeadFieldProvenanceMethod | "unknown" | null>;
  provenances: Record<LeadEnrichmentFieldKey, LeadFieldProvenance | null>;
}> {
  const overlay = readWebEnrichmentAttributes(lead.attributes);
  const company = lead.companyId
    ? (await findCompaniesByIds(lead.workspaceId, [lead.companyId]))[0]
    : null;
  const values: Record<LeadEnrichmentFieldKey, string | null> = {
    companyName: company?.name ?? null,
    jobTitle: lead.jobTitle,
    industry: lead.industry,
    city: lead.city ?? overlay.city ?? null,
    stateRegion: lead.stateRegion,
    country: lead.country ?? overlay.country ?? null,
    preferredContactClues: overlay.preferredContactClues ?? lead.preferredContactMethod,
    professionalProfileUrl: lead.professionalProfileUrl ?? overlay.professionalProfileUrl ?? null,
    otherProfessional: overlay.otherProfessional ?? null,
  };
  const provenances: Record<LeadEnrichmentFieldKey, LeadFieldProvenance | null> = {
    companyName: lead.intelligenceProvenance.companyId ?? null,
    jobTitle: lead.intelligenceProvenance.jobTitle ?? null,
    industry: lead.intelligenceProvenance.industry ?? null,
    city: lead.intelligenceProvenance.city ?? null,
    stateRegion: lead.intelligenceProvenance.stateRegion ?? null,
    country: lead.intelligenceProvenance.country ?? null,
    preferredContactClues: null,
    professionalProfileUrl: lead.intelligenceProvenance.professionalProfileUrl ?? null,
    otherProfessional: null,
  };
  const origins = Object.fromEntries(
    LEAD_ENRICHMENT_FIELD_KEYS.map((key) => [key, asOrigin(provenances[key])]),
  ) as Record<LeadEnrichmentFieldKey, LeadFieldProvenanceMethod | "unknown" | null>;
  return { values, origins, provenances };
}

function buildSuggestions(input: {
  synthesis: {
    suggestions: Array<{
      fieldKey: string;
      value: string;
      confidencePercent: number;
      rationale: string;
      sourceUrls: string[];
    }>;
  };
  current: Awaited<ReturnType<typeof currentFieldMap>>;
  retrievedAt: string;
  searchProvider: string;
  aiModel: string;
  retrievedUrls: Iterable<string>;
}): LeadEnrichmentSuggestion[] {
  const out: LeadEnrichmentSuggestion[] = [];
  for (const raw of input.synthesis.suggestions) {
    if (!isLeadEnrichmentFieldKey(raw.fieldKey)) {
      continue;
    }
    const value = sanitizeEnrichmentText(raw.value);
    const rationale = sanitizeEnrichmentText(raw.rationale) ?? "";
    if (!value) {
      continue;
    }
    const sourceUrls = citeOnlyRetrievedUrls(raw.sourceUrls, input.retrievedUrls);
    const { confidencePercent, dropped } = clampConfidence({
      confidencePercent: raw.confidencePercent,
      sourceUrls,
    });
    if (dropped || confidencePercent <= 0 || sourceUrls.length === 0) {
      continue;
    }
    if (contentLooksExcluded(`${value} ${rationale}`)) {
      continue;
    }
    out.push({
      id: newSuggestionId(),
      fieldKey: raw.fieldKey,
      proposedValue: value,
      currentValue: input.current.values[raw.fieldKey],
      currentOrigin: input.current.origins[raw.fieldKey],
      confidencePercent,
      rationale,
      sourceUrls,
      retrievedAt: input.retrievedAt,
      searchProvider: input.searchProvider,
      aiModel: input.aiModel,
      status: "proposed",
      acceptedValue: null,
      previousValue: null,
      previousProvenance: input.current.provenances[raw.fieldKey],
      overwriteAcknowledged: false,
      decidedBy: null,
      decidedAt: null,
    });
  }
  return out;
}

export async function getLeadEnrichmentCapability(workspaceId: string): Promise<{
  enabled: boolean;
  demoMode: boolean;
  openaiConfigured: boolean;
  searchConfigured: boolean;
  retentionDays: number;
  legalReviewAcknowledgedAt: string | null;
  reasonDisabled: string | null;
}> {
  await syncSystemRolePermissionsForWorkspace(workspaceId);
  const workspace = await findWorkspaceById(workspaceId);
  const settings = workspace?.leadEnrichment;
  const openaiConfigured = isOpenAiConfigured();
  const searchConfigured = isSearchConfigured();
  const demoMode = Boolean(settings?.demoMode) || isDemoEnvEnabled();
  const enabledFlag = settings?.enabled !== false;
  let reasonDisabled: string | null = null;
  if (!enabledFlag) {
    reasonDisabled = "Workspace enrichment is turned off in Settings.";
  } else if (!demoMode && !openaiConfigured) {
    reasonDisabled = "OPENAI_API_KEY is not configured on the server.";
  }
  return {
    enabled: enabledFlag && (demoMode || openaiConfigured),
    demoMode,
    openaiConfigured,
    searchConfigured,
    retentionDays: settings?.retentionDays ?? 180,
    legalReviewAcknowledgedAt: settings?.legalReviewAcknowledgedAt
      ? settings.legalReviewAcknowledgedAt.toISOString()
      : null,
    reasonDisabled,
  };
}

export async function getLeadEnrichmentForLead(
  workspaceId: string,
  leadId: string,
): Promise<{
  capability: Awaited<ReturnType<typeof getLeadEnrichmentCapability>>;
  overlay: ReturnType<typeof readWebEnrichmentAttributes>;
  runs: LeadEnrichmentRunRecord[];
}> {
  const lead = await findLeadById(workspaceId, leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const now = Date.now();
  const runs = await listEnrichmentRunsForLead(workspaceId, leadId);
  const normalized = await Promise.all(
    runs.map(async (run) => {
      if (
        run.expiresAt &&
        new Date(run.expiresAt).getTime() < now &&
        (run.status === "reviewing" || run.status === "searching")
      ) {
        return updateEnrichmentRun(workspaceId, run.id, { status: "expired" });
      }
      return run;
    }),
  );
  return {
    capability: await getLeadEnrichmentCapability(workspaceId),
    overlay: readWebEnrichmentAttributes(lead.attributes),
    runs: normalized,
  };
}

export async function startLeadEnrichment(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  allowedSources?: LeadEnrichmentAllowedSource[];
  providers?: EnrichmentProviders;
}): Promise<LeadEnrichmentRunRecord> {
  const capability = await getLeadEnrichmentCapability(input.workspaceId);
  if (!capability.enabled) {
    throw new AppError(
      "VALIDATION_ERROR",
      capability.reasonDisabled ?? "Lead enrichment is disabled.",
    );
  }
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const email = lead.email?.trim();
  const fullName = lead.fullName.trim();
  if (!email || !fullName) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enrichment requires the lead’s name and email.",
    );
  }
  const requestedSources =
    input.allowedSources && input.allowedSources.length > 0
      ? input.allowedSources
      : [...LEAD_ENRICHMENT_ALLOWED_SOURCES];
  const allowedSources = requestedSources.filter((source) =>
    (LEAD_ENRICHMENT_ALLOWED_SOURCES as readonly string[]).includes(source),
  );
  if (allowedSources.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Select at least one allowed public source.");
  }

  const run = await createEnrichmentRun({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    initiatedBy: input.actorId,
    queryFullName: fullName,
    queryEmail: email,
    allowedSources,
    demoMode: capability.demoMode,
    retentionDays: capability.retentionDays,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.enrichment_started",
    entityType: "lead_enrichment_run",
    entityId: run.id,
    after: {
      leadId: input.leadId,
      allowedSources,
      demoMode: capability.demoMode,
    },
  });

  try {
    const current = await currentFieldMap(lead);
    const retrievedAt = new Date().toISOString();
    let hits: { url: string; title: string; snippet: string; retrievedAt: string }[] = [];
    let provider = capability.demoMode ? "demo_fixture" : "none";
    let synthesis;

    if (capability.demoMode) {
      const fixture = getLeadEnrichmentDemoFixture({ fullName, email });
      hits = fixture.hits;
      synthesis = {
        identityMatch: fixture.identityMatch,
        identityRationale: fixture.identityRationale,
        suggestions: fixture.suggestions,
        summary: fixture.summary,
        model: "demo-fixture",
      };
    } else {
      const providers = input.providers ?? liveEnrichmentProviders;
      const search = await providers.search(
        `"${fullName}" "${email}"`,
        allowedSources,
      );
      hits = search.hits;
      provider = search.provider;
      synthesis = await providers.synthesize({
        fullName,
        email,
        known: current.values,
        allowedSources,
        hits,
      });
    }

    if (synthesis.identityMatch !== "unique") {
      const updated = await updateEnrichmentRun(input.workspaceId, run.id, {
        status: synthesis.identityMatch === "ambiguous" ? "ambiguous" : "failed",
        searchProvider: provider,
        aiModel: synthesis.model,
        retrievedAt: new Date(retrievedAt),
        identityMatch: synthesis.identityMatch,
        identityRationale: synthesis.identityRationale,
        failureMessage:
          synthesis.identityMatch === "ambiguous"
            ? "Identity is ambiguous. No enrichment result was produced."
            : "No unique public professional identity matched name and email.",
        sources: hits,
        suggestions: [],
        summaryDraft: null,
      });
      return updated;
    }

    const suggestions = buildSuggestions({
      synthesis,
      current,
      retrievedAt,
      searchProvider: provider,
      aiModel: synthesis.model,
      retrievedUrls: hits.map((hit) => hit.url),
    });
    const citationUrls = citeOnlyRetrievedUrls(
      synthesis.summary.citationUrls,
      hits.map((hit) => hit.url),
    );
    const summaryDraft: LeadEnrichmentSummary | null =
      synthesis.summary.text && citationUrls.length > 0
        ? {
            text: synthesis.summary.text,
            citationUrls,
            status: "draft",
            acceptedAt: null,
            acceptedBy: null,
          }
        : null;

    const reviewing = await updateEnrichmentRun(input.workspaceId, run.id, {
      status: "reviewing",
      searchProvider: provider,
      aiModel: synthesis.model,
      retrievedAt: new Date(retrievedAt),
      identityMatch: "unique",
      identityRationale: synthesis.identityRationale,
      sources: hits,
      suggestions,
      summaryDraft,
    });

    const safeDecisions = suggestions
      .filter((suggestion) =>
        isSafeToAutoApplySuggestion({
          currentValue: suggestion.currentValue,
          currentOrigin: suggestion.currentOrigin,
        }),
      )
      .map((suggestion) => ({
        suggestionId: suggestion.id,
        action: "accept" as const,
      }));

    if (safeDecisions.length === 0 && !summaryDraft) {
      return reviewing;
    }

    return applyLeadEnrichmentDecisions({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      runId: run.id,
      actorId: input.actorId,
      decisions: safeDecisions,
      summaryAction: summaryDraft ? "accept" : undefined,
    });
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "Enrichment search failed.";
    await updateEnrichmentRun(input.workspaceId, run.id, {
      status: "failed",
      failureMessage: message,
    });
    throw error;
  }
}

export async function applyLeadEnrichmentDecisions(input: {
  workspaceId: string;
  leadId: string;
  runId: string;
  actorId: string;
  decisions: Array<{
    suggestionId: string;
    action: "accept" | "reject" | "edit" | "clear";
    editedValue?: string;
    overwriteAcknowledged?: boolean;
  }>;
  summaryAction?: "accept" | "reject";
  summaryEdit?: string;
}): Promise<LeadEnrichmentRunRecord> {
  const run = await findEnrichmentRunById(input.workspaceId, input.runId);
  if (!run || run.leadId !== input.leadId) {
    throw new AppError("NOT_FOUND", "Enrichment run not found.");
  }
  if (run.status !== "reviewing" && run.status !== "accepted") {
    throw new AppError("VALIDATION_ERROR", "This enrichment run cannot be updated.");
  }
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const current = await currentFieldMap(lead);
  const suggestions = [...run.suggestions];
  const leadPatch: {
    jobTitle?: string | null;
    industry?: string | null;
    stateRegion?: string | null;
    city?: string | null;
    country?: string | null;
    professionalProfileUrl?: string | null;
    companyId?: string | null;
    intelligenceProvenance?: LeadIntelligenceProvenance;
    attributes?: Record<string, unknown>;
  } = {};
  let provenance = { ...lead.intelligenceProvenance };
  let attributes = lead.attributes ?? {};
  const stamp = buildLeadFieldProvenance({
    method: WEB_ENRICHMENT_METHOD,
    source: WEB_ENRICHMENT_SOURCE,
    notes: "Accepted from manual public-web enrichment.",
  });
  const now = new Date().toISOString();
  const applied: string[] = [];
  const cleared: string[] = [];

  async function writeField(
    fieldKey: LeadEnrichmentFieldKey,
    nextValue: string | null,
    nextProvenance: LeadFieldProvenance | null | undefined,
  ) {
    if (fieldKey === "companyName") {
      if (nextValue && /^[a-fA-F0-9]{24}$/.test(nextValue)) {
        leadPatch.companyId = nextValue;
      } else if (nextValue) {
        const resolved = await resolveOrCreateCompanyByName(
          input.workspaceId,
          input.actorId,
          nextValue,
        );
        leadPatch.companyId = resolved?.company.id ?? null;
      } else {
        leadPatch.companyId = null;
      }
      provenance = mergeIntelligenceProvenance(provenance, {
        companyId: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) {
        provenance = { ...provenance, companyId: undefined };
      }
    } else if (fieldKey === "jobTitle") {
      leadPatch.jobTitle = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        jobTitle: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) provenance = { ...provenance, jobTitle: undefined };
    } else if (fieldKey === "industry") {
      leadPatch.industry = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        industry: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) provenance = { ...provenance, industry: undefined };
    } else if (fieldKey === "stateRegion") {
      leadPatch.stateRegion = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        stateRegion: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) provenance = { ...provenance, stateRegion: undefined };
    } else if (fieldKey === "city") {
      leadPatch.city = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        city: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) provenance = { ...provenance, city: undefined };
    } else if (fieldKey === "country") {
      leadPatch.country = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        country: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) provenance = { ...provenance, country: undefined };
    } else if (fieldKey === "professionalProfileUrl") {
      leadPatch.professionalProfileUrl = nextValue;
      provenance = mergeIntelligenceProvenance(provenance, {
        professionalProfileUrl: nextProvenance ?? undefined,
      });
      if (nextProvenance === null) {
        provenance = { ...provenance, professionalProfileUrl: undefined };
      }
    } else if (fieldKey === "preferredContactClues") {
      attributes = mergeWebEnrichmentAttributes(attributes, {
        preferredContactClues: nextValue,
      });
    } else if (fieldKey === "otherProfessional") {
      attributes = mergeWebEnrichmentAttributes(attributes, {
        otherProfessional: nextValue,
      });
    }
  }

  for (const decision of input.decisions) {
    const index = suggestions.findIndex((item) => item.id === decision.suggestionId);
    if (index < 0) {
      throw new AppError("VALIDATION_ERROR", "Unknown enrichment suggestion.");
    }
    const suggestion = suggestions[index]!;
    if (decision.action === "clear") {
      if (suggestion.status !== "accepted" && suggestion.status !== "edited") {
        continue;
      }
      const previous =
        suggestion.fieldKey === "companyName" &&
        suggestion.previousValue &&
        /^[a-fA-F0-9]{24}$/.test(suggestion.previousValue)
          ? suggestion.previousValue
          : (suggestion.previousValue ?? null);
      await writeField(
        suggestion.fieldKey,
        previous,
        suggestion.previousProvenance,
      );
      suggestions[index] = {
        ...suggestion,
        status: "reverted",
        decidedBy: input.actorId,
        decidedAt: now,
      };
      cleared.push(suggestion.fieldKey);
      continue;
    }
    if (
      decision.action === "edit" &&
      (suggestion.status === "accepted" || suggestion.status === "edited")
    ) {
      const editedValue = sanitizeEnrichmentText(decision.editedValue ?? "");
      if (!editedValue) {
        throw new AppError("VALIDATION_ERROR", "Accepted enrichment value cannot be empty.");
      }
      await writeField(suggestion.fieldKey, editedValue, stamp);
      suggestions[index] = {
        ...suggestion,
        status: "edited",
        acceptedValue: editedValue,
        decidedBy: input.actorId,
        decidedAt: now,
      };
      applied.push(suggestion.fieldKey);
      continue;
    }
    if (suggestion.status !== "proposed") {
      continue;
    }
    if (decision.action === "reject") {
      suggestions[index] = {
        ...suggestion,
        status: "rejected",
        decidedBy: input.actorId,
        decidedAt: now,
      };
      continue;
    }
    const nextValue =
      decision.action === "edit"
        ? sanitizeEnrichmentText(decision.editedValue ?? "")
        : suggestion.proposedValue;
    if (!nextValue) {
      throw new AppError("VALIDATION_ERROR", "Accepted enrichment value cannot be empty.");
    }
    if (
      crmValueRequiresOverwrite(suggestion.currentValue, suggestion.currentOrigin) &&
      !decision.overwriteAcknowledged
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Confirm overwrite of CRM-entered ${suggestion.fieldKey} before accepting.`,
        { details: { fieldKey: suggestion.fieldKey } },
      );
    }

    await writeField(suggestion.fieldKey, nextValue, stamp);

    suggestions[index] = {
      ...suggestion,
      status: decision.action === "edit" ? "edited" : "accepted",
      acceptedValue: nextValue,
      previousValue:
        suggestion.fieldKey === "companyName"
          ? lead.companyId ?? current.values.companyName
          : current.values[suggestion.fieldKey],
      previousProvenance: current.provenances[suggestion.fieldKey],
      overwriteAcknowledged: Boolean(decision.overwriteAcknowledged),
      decidedBy: input.actorId,
      decidedAt: now,
    };
    applied.push(suggestion.fieldKey);
  }

  let acceptedSummary = run.acceptedSummary;
  let summaryDraft = run.summaryDraft;
  if (input.summaryAction && run.summaryDraft) {
    if (input.summaryAction === "reject") {
      summaryDraft = { ...run.summaryDraft, status: "rejected" };
    } else {
      const text = sanitizeEnrichmentText(input.summaryEdit ?? run.summaryDraft.text);
      if (text) {
        acceptedSummary = {
          text,
          citationUrls: run.summaryDraft.citationUrls,
          status: "accepted",
          acceptedAt: now,
          acceptedBy: input.actorId,
        };
        summaryDraft = { ...acceptedSummary };
        attributes = mergeWebEnrichmentAttributes(attributes, {
          summary: acceptedSummary,
          lastRunId: run.id,
        });
      }
    }
  }

  attributes = mergeWebEnrichmentAttributes(attributes, { lastRunId: run.id });
  leadPatch.intelligenceProvenance = provenance;
  leadPatch.attributes = attributes;

  if (applied.length > 0 || cleared.length > 0 || input.summaryAction === "accept") {
    await updateLead(input.workspaceId, input.leadId, leadPatch);
  }

  const nextStatus = suggestions.some((item) => item.status === "proposed")
    ? "reviewing"
    : "accepted";

  const updated = await updateEnrichmentRun(input.workspaceId, run.id, {
    suggestions,
    summaryDraft,
    acceptedSummary,
    status: nextStatus,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.enrichment_reviewed",
    entityType: "lead_enrichment_run",
    entityId: run.id,
    after: {
      applied,
      cleared,
      summaryAction: input.summaryAction ?? null,
      triggerAutomation: WEB_ENRICHMENT_SIDE_EFFECT_GUARD.triggerAutomation,
    },
  });

  return updated;
}

export async function revertLeadEnrichmentRun(input: {
  workspaceId: string;
  leadId: string;
  runId: string;
  actorId: string;
}): Promise<LeadEnrichmentRunRecord> {
  const run = await findEnrichmentRunById(input.workspaceId, input.runId);
  if (!run || run.leadId !== input.leadId) {
    throw new AppError("NOT_FOUND", "Enrichment run not found.");
  }
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }

  const leadPatch: Parameters<typeof updateLead>[2] = {};
  let provenance = { ...lead.intelligenceProvenance };
  let attributes = lead.attributes ?? {};
  const suggestions = run.suggestions.map((suggestion) => {
    if (suggestion.status !== "accepted" && suggestion.status !== "edited") {
      return suggestion;
    }
    const previous = suggestion.previousValue ?? null;
    if (suggestion.fieldKey === "companyName") {
      leadPatch.companyId =
        suggestion.previousValue && /^[a-fA-F0-9]{24}$/.test(suggestion.previousValue)
          ? suggestion.previousValue
          : null;
      provenance.companyId = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "jobTitle") {
      leadPatch.jobTitle = previous;
      provenance.jobTitle = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "industry") {
      leadPatch.industry = previous;
      provenance.industry = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "stateRegion") {
      leadPatch.stateRegion = previous;
      provenance.stateRegion = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "city") {
      leadPatch.city = previous;
      provenance.city = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "country") {
      leadPatch.country = previous;
      provenance.country = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "professionalProfileUrl") {
      leadPatch.professionalProfileUrl = previous;
      provenance.professionalProfileUrl = suggestion.previousProvenance;
    } else if (suggestion.fieldKey === "preferredContactClues") {
      attributes = mergeWebEnrichmentAttributes(attributes, {
        preferredContactClues: previous,
      });
    } else if (suggestion.fieldKey === "otherProfessional") {
      attributes = mergeWebEnrichmentAttributes(attributes, {
        otherProfessional: previous,
      });
    }
    return {
      ...suggestion,
      status: "reverted" as const,
      decidedBy: input.actorId,
      decidedAt: new Date().toISOString(),
    };
  });

  if (run.acceptedSummary) {
    attributes = mergeWebEnrichmentAttributes(attributes, { summary: null });
  }

  leadPatch.intelligenceProvenance = provenance;
  leadPatch.attributes = attributes;
  await updateLead(input.workspaceId, input.leadId, leadPatch);

  const updated = await updateEnrichmentRun(input.workspaceId, run.id, {
    suggestions,
    acceptedSummary: null,
    status: "reviewing",
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.enrichment_reverted",
    entityType: "lead_enrichment_run",
    entityId: run.id,
    after: { leadId: input.leadId },
  });
  return updated;
}

export async function revokeLeadEnrichment(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
}): Promise<{ revokedRuns: number }> {
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead) {
    throw new AppError("NOT_FOUND", "Lead not found.");
  }
  const runs = await listEnrichmentRunsForLead(input.workspaceId, input.leadId);
  const appliedRuns = [...runs]
    .filter((run) => !run.revokedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const run of appliedRuns) {
    const hasApplied = run.suggestions.some(
      (suggestion) => suggestion.status === "accepted" || suggestion.status === "edited",
    );
    if (hasApplied) {
      await revertLeadEnrichmentRun({
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        runId: run.id,
        actorId: input.actorId,
      });
    }
  }
  const revokedRuns = await revokeEnrichmentRunsForLead(
    input.workspaceId,
    input.leadId,
    input.actorId,
  );
  const fresh = await findLeadById(input.workspaceId, input.leadId);
  const attributes = mergeWebEnrichmentAttributes(fresh?.attributes ?? lead.attributes, {
    preferredContactClues: null,
    otherProfessional: null,
    summary: null,
    lastRunId: null,
  });
  await updateLead(input.workspaceId, input.leadId, { attributes });
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.enrichment_revoked",
    entityType: "lead",
    entityId: input.leadId,
    after: { revokedRuns },
  });
  return { revokedRuns };
}

export async function getLeadEnrichmentWorkspaceSettings(workspaceId: string) {
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }
  const capability = await getLeadEnrichmentCapability(workspaceId);
  const enrichment = workspace.leadEnrichment;
  return {
    enabled: enrichment?.enabled !== false,
    demoMode: enrichment?.demoMode === true,
    retentionDays: enrichment?.retentionDays ?? 180,
    legalReviewAcknowledgedAt: enrichment?.legalReviewAcknowledgedAt
      ? enrichment.legalReviewAcknowledgedAt.toISOString()
      : null,
    legalReviewAcknowledgedBy: enrichment?.legalReviewAcknowledgedBy ?? null,
    openaiConfigured: capability.openaiConfigured,
    searchConfigured: capability.searchConfigured,
    usable: capability.enabled,
    reasonDisabled: capability.reasonDisabled,
  };
}

export async function updateLeadEnrichmentWorkspaceSettings(input: {
  workspaceId: string;
  actorId: string;
  enabled?: boolean;
  demoMode?: boolean;
  retentionDays?: number;
  acknowledgeLegalReview?: true;
}) {
  const existing = await findWorkspaceById(input.workspaceId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }
  const acknowledged =
    Boolean(existing.leadEnrichment?.legalReviewAcknowledgedAt) ||
    input.acknowledgeLegalReview === true;
  if (input.enabled === true && !acknowledged) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Acknowledge the inclusion/exclusion policy and legal/privacy review before enabling enrichment.",
    );
  }
  const updated = await updateWorkspace(input.workspaceId, {
    leadEnrichment: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.demoMode !== undefined ? { demoMode: input.demoMode } : {}),
      ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
      ...(input.acknowledgeLegalReview
        ? {
            legalReviewAcknowledgedAt: new Date(),
            legalReviewAcknowledgedBy: input.actorId,
          }
        : {}),
    },
  });
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "settings.lead_enrichment_updated",
    entityType: "settings",
    entityId: input.workspaceId,
    before: {
      enabled: existing.leadEnrichment?.enabled === true,
      demoMode: existing.leadEnrichment?.demoMode === true,
    },
    after: {
      enabled: updated.leadEnrichment?.enabled === true,
      demoMode: updated.leadEnrichment?.demoMode === true,
      retentionDays: updated.leadEnrichment?.retentionDays,
    },
  });
  return getLeadEnrichmentWorkspaceSettings(input.workspaceId);
}
