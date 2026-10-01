import "server-only";

import { AppError } from "@/server/errors";
import { DEFAULT_NEWSLETTER_AUDIENCE_LIMIT } from "@/lib/newsletter";
import {
  isValidEmail,
  normalizeEmailValue,
} from "@/server/imports/import-normalizers";
import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import {
  findLeadsByIds,
  type LeadRecord,
} from "@/server/repositories/leads";
import { findSuppressionsByEmails } from "@/server/repositories/email-suppressions";
import { findImportJobById } from "@/server/repositories/import-jobs";
import {
  findNewsletterAudienceSegments,
  type NewsletterAudienceSegmentRecord,
} from "@/server/repositories/newsletter-audience-segments";
import type { CampaignAudienceSummary } from "@/server/repositories/campaigns";

export type NewsletterAudienceLead = {
  leadId: string;
  email: string;
  fullName: string;
  projectId: string | null;
  emailConsentStatus: string;
  segmentIds: string[];
  unknownConsent: boolean;
};

export type NewsletterAudienceExclusion = {
  leadId: string;
  email: string | null;
  fullName: string;
  reason:
    | "missing_email"
    | "invalid_email"
    | "unsubscribed"
    | "suppressed"
    | "archived"
    | "deduped";
};

export type NewsletterAudienceResolveResult = {
  included: NewsletterAudienceLead[];
  exclusions: NewsletterAudienceExclusion[];
  flaggedUnknownConsent: NewsletterAudienceLead[];
  summary: CampaignAudienceSummary;
  importSummaries: Array<{
    segmentId: string;
    importJobId: string;
    status: string;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    resolvedLeadCount: number;
  }>;
};

function leadMatchesTags(
  lead: LeadRecord,
  tagIds: string[],
  tagMatch: "any" | "all",
): boolean {
  if (tagIds.length === 0) {
    return true;
  }

  const leadTags = new Set(lead.tags);
  if (tagMatch === "all") {
    return tagIds.every((tagId) => leadTags.has(tagId));
  }

  return tagIds.some((tagId) => leadTags.has(tagId));
}

async function resolveProjectTagsSegmentLeadIds(
  workspaceId: string,
  segment: NewsletterAudienceSegmentRecord,
): Promise<string[]> {
  const membershipLeadIds = await findLeadIdsForProjectMembership(
    workspaceId,
    segment.projectId,
  );

  if (membershipLeadIds.length === 0) {
    return [];
  }

  const CHUNK = 500;
  const matched: string[] = [];

  for (let index = 0; index < membershipLeadIds.length; index += CHUNK) {
    const chunkIds = membershipLeadIds.slice(index, index + CHUNK);
    const leads = await findLeadsByIds(workspaceId, chunkIds);

    for (const lead of leads) {
      if (lead.archivedAt) {
        continue;
      }
      if (!leadMatchesTags(lead, segment.tagIds, segment.tagMatch)) {
        continue;
      }
      matched.push(lead.id);
    }
  }

  return matched;
}

async function resolveCsvImportSegmentLeadIds(
  workspaceId: string,
  segment: NewsletterAudienceSegmentRecord,
): Promise<{ leadIds: string[]; importSummary: NewsletterAudienceResolveResult["importSummaries"][number] | null }> {
  if (!segment.importJobId) {
    return { leadIds: [], importSummary: null };
  }

  const job = await findImportJobById(workspaceId, segment.importJobId, {
    includeRowResults: true,
  });

  if (!job) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletter CSV segment references a missing import job.",
    );
  }

  if (job.entityType !== "lead") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletter CSV segments only support lead imports.",
    );
  }

  if (job.status !== "completed" && job.status !== "completed_with_errors") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletter CSV segment import is not finished yet.",
    );
  }

  if (
    job.newsletterCampaignId &&
    segment.campaignId &&
    job.newsletterCampaignId !== segment.campaignId
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletter CSV segment import belongs to a different newsletter.",
    );
  }

  const leadIds = [
    ...new Set(
      (job.rowResults ?? [])
        .map((row) => row.entityId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    leadIds,
    importSummary: {
      segmentId: segment.id,
      importJobId: job.id,
      status: job.status,
      createdCount: job.createdCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      resolvedLeadCount: leadIds.length,
    },
  };
}

async function resolveSegmentLeadIds(
  workspaceId: string,
  segment: NewsletterAudienceSegmentRecord,
): Promise<{
  leadIds: string[];
  importSummary: NewsletterAudienceResolveResult["importSummaries"][number] | null;
}> {
  if (segment.type === "csv_import") {
    return resolveCsvImportSegmentLeadIds(workspaceId, segment);
  }

  return {
    leadIds: await resolveProjectTagsSegmentLeadIds(workspaceId, segment),
    importSummary: null,
  };
}

function preferLeadForDedupe(
  current: LeadRecord,
  candidate: LeadRecord,
  segmentProjectId: string,
): LeadRecord {
  const currentPrimary = current.projectId === segmentProjectId;
  const candidatePrimary = candidate.projectId === segmentProjectId;

  if (candidatePrimary && !currentPrimary) {
    return candidate;
  }

  if (currentPrimary && !candidatePrimary) {
    return current;
  }

  return current.id <= candidate.id ? current : candidate;
}

export async function resolveNewsletterAudience(
  workspaceId: string,
  campaignId: string,
  options: { audienceLimit?: number } = {},
): Promise<NewsletterAudienceResolveResult> {
  const audienceLimit = options.audienceLimit ?? DEFAULT_NEWSLETTER_AUDIENCE_LIMIT;
  const segments = await findNewsletterAudienceSegments(workspaceId, campaignId);

  if (segments.length === 0) {
    return {
      included: [],
      exclusions: [],
      flaggedUnknownConsent: [],
      summary: {
        queued: 0,
        excludedMissingEmail: 0,
        excludedUnsubscribed: 0,
        excludedSuppressed: 0,
        excludedInvalid: 0,
        excludedArchived: 0,
        unknownConsent: 0,
        deduped: 0,
      },
      importSummaries: [],
    };
  }

  const leadSegmentMap = new Map<string, Set<string>>();
  const leadProjectHint = new Map<string, string>();
  const importSummaries: NewsletterAudienceResolveResult["importSummaries"] = [];

  for (const segment of segments) {
    const { leadIds, importSummary } = await resolveSegmentLeadIds(
      workspaceId,
      segment,
    );
    if (importSummary) {
      importSummaries.push(importSummary);
    }

    for (const leadId of leadIds) {
      const existing = leadSegmentMap.get(leadId) ?? new Set<string>();
      existing.add(segment.id);
      leadSegmentMap.set(leadId, existing);
      if (!leadProjectHint.has(leadId)) {
        leadProjectHint.set(leadId, segment.projectId);
      }
    }
  }

  const allLeadIds = [...leadSegmentMap.keys()];
  const leadsById = new Map<string, LeadRecord>();
  const CHUNK = 500;

  for (let index = 0; index < allLeadIds.length; index += CHUNK) {
    const chunk = await findLeadsByIds(workspaceId, allLeadIds.slice(index, index + CHUNK));
    for (const lead of chunk) {
      leadsById.set(lead.id, lead);
    }
  }

  const exclusions: NewsletterAudienceExclusion[] = [];
  const candidatesByEmail = new Map<
    string,
    { lead: LeadRecord; segmentIds: string[]; segmentProjectId: string }
  >();

  let excludedMissingEmail = 0;
  let excludedUnsubscribed = 0;
  let excludedInvalid = 0;
  let excludedArchived = 0;
  let deduped = 0;

  for (const leadId of allLeadIds) {
    const lead = leadsById.get(leadId);
    if (!lead) {
      continue;
    }

    const segmentIds = [...(leadSegmentMap.get(leadId) ?? [])];
    const segmentProjectId = leadProjectHint.get(leadId) ?? lead.projectId ?? "";

    if (lead.archivedAt) {
      excludedArchived += 1;
      exclusions.push({
        leadId: lead.id,
        email: lead.email,
        fullName: lead.fullName,
        reason: "archived",
      });
      continue;
    }

    const normalized =
      lead.emailNormalized?.trim().toLowerCase() ||
      normalizeEmailValue(lead.email) ||
      null;

    if (!normalized) {
      excludedMissingEmail += 1;
      exclusions.push({
        leadId: lead.id,
        email: lead.email,
        fullName: lead.fullName,
        reason: "missing_email",
      });
      continue;
    }

    if (!isValidEmail(normalized)) {
      excludedInvalid += 1;
      exclusions.push({
        leadId: lead.id,
        email: lead.email,
        fullName: lead.fullName,
        reason: "invalid_email",
      });
      continue;
    }

    if (
      lead.emailConsentStatus === "unsubscribed" ||
      lead.emailUnsubscribedAt !== null
    ) {
      excludedUnsubscribed += 1;
      exclusions.push({
        leadId: lead.id,
        email: lead.email,
        fullName: lead.fullName,
        reason: "unsubscribed",
      });
      continue;
    }

    const existing = candidatesByEmail.get(normalized);
    if (!existing) {
      candidatesByEmail.set(normalized, { lead, segmentIds, segmentProjectId });
      continue;
    }

    deduped += 1;
    const preferred = preferLeadForDedupe(existing.lead, lead, segmentProjectId);
    const mergedSegmentIds = [
      ...new Set([...existing.segmentIds, ...segmentIds]),
    ];

    if (preferred.id === lead.id) {
      exclusions.push({
        leadId: existing.lead.id,
        email: existing.lead.email,
        fullName: existing.lead.fullName,
        reason: "deduped",
      });
      candidatesByEmail.set(normalized, {
        lead,
        segmentIds: mergedSegmentIds,
        segmentProjectId,
      });
    } else {
      exclusions.push({
        leadId: lead.id,
        email: lead.email,
        fullName: lead.fullName,
        reason: "deduped",
      });
      candidatesByEmail.set(normalized, {
        ...existing,
        segmentIds: mergedSegmentIds,
      });
    }
  }

  const candidateEmails = [...candidatesByEmail.keys()];
  const suppressions = await findSuppressionsByEmails(workspaceId, candidateEmails);
  const suppressedEmails = new Set(suppressions.map((row) => row.email.toLowerCase()));

  const included: NewsletterAudienceLead[] = [];
  const flaggedUnknownConsent: NewsletterAudienceLead[] = [];
  let excludedSuppressed = 0;

  for (const [email, candidate] of candidatesByEmail) {
    if (suppressedEmails.has(email)) {
      excludedSuppressed += 1;
      exclusions.push({
        leadId: candidate.lead.id,
        email: candidate.lead.email,
        fullName: candidate.lead.fullName,
        reason: "suppressed",
      });
      continue;
    }

    const entry: NewsletterAudienceLead = {
      leadId: candidate.lead.id,
      email,
      fullName: candidate.lead.fullName,
      projectId: candidate.lead.projectId,
      emailConsentStatus: candidate.lead.emailConsentStatus,
      segmentIds: candidate.segmentIds,
      unknownConsent: candidate.lead.emailConsentStatus === "unknown",
    };

    included.push(entry);
    if (entry.unknownConsent) {
      flaggedUnknownConsent.push(entry);
    }
  }

  if (included.length > audienceLimit) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Newsletter audience exceeds the maximum of ${audienceLimit.toLocaleString()} recipients (${included.length.toLocaleString()} included). Narrow the project or tags and try again.`,
    );
  }

  return {
    included,
    exclusions,
    flaggedUnknownConsent,
    summary: {
      queued: included.length,
      excludedMissingEmail,
      excludedUnsubscribed,
      excludedSuppressed,
      excludedInvalid,
      excludedArchived,
      unknownConsent: flaggedUnknownConsent.length,
      deduped,
    },
    importSummaries,
  };
}

export function assertNewsletterAudienceSendable(
  result: NewsletterAudienceResolveResult,
): void {
  if (result.included.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Newsletter has no eligible recipients after exclusions.",
    );
  }
}
