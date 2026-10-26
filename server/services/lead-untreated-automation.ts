import "server-only";

import {
  LEAD_NEW_STATUS_KEY,
  LEAD_TREATMENT_AUDIT_ACTIONS,
  LEAD_UNTREATED_AUTOMATION_SOURCE,
  LEAD_UNTREATED_STATUS_KEY,
  LEAD_UNTREATED_STATUS_LABEL,
  LEAD_UNTREATED_THRESHOLD_DAYS,
  evaluateLeadUntreated,
  leadUntreatedCutoff,
  parseInboundReceivedAt,
} from "@/lib/lead-untreated-rule";
import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  findActiveDictionaryItemByTypeAndLabel,
  findDictionaryItemByTypeAndKey,
  type DictionaryItemRecord,
} from "@/server/repositories/dictionary-items";
import {
  findLatestActivityAtByLead,
  findLatestTreatmentAuditAtByLead,
  findLatestVisitSessionAtByLead,
  findStaleNewLeadCandidates,
  markLeadUntreatedIfStillNew,
} from "@/server/repositories/lead-untreated";
import { findAllWorkspaces, type WorkspaceRecord } from "@/server/repositories/workspaces";
import { captureError } from "@/server/observability/capture-error";

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_UPDATES_PER_WORKSPACE = 500;

export type LeadUntreatedWorkspaceSkipReason =
  | "new_status_missing"
  | "untreated_status_missing"
  | "untreated_status_inactive"
  | "failed";

export type LeadUntreatedWorkspaceSummary = {
  workspaceId: string;
  workspaceSlug: string;
  skipped: LeadUntreatedWorkspaceSkipReason | null;
  scanned: number;
  skippedInvalid: number;
  eligible: number;
  moved: number;
  keptRecentTreatment: number;
  lostRace: number;
  truncated: boolean;
};

export type LeadUntreatedRunSummary = {
  dryRun: boolean;
  thresholdDays: number;
  cutoff: string;
  workspaces: number;
  scanned: number;
  skippedInvalid: number;
  eligible: number;
  moved: number;
  workspacesSkipped: number;
  results: LeadUntreatedWorkspaceSummary[];
};

export type LeadUntreatedRunOptions = {
  now?: Date;
  dryRun?: boolean;
  thresholdDays?: number;
  workspaceIds?: string[];
  excludedProjectIds?: string[];
  pageSize?: number;
  maxUpdatesPerWorkspace?: number;
};

/**
 * Reuses the workspace's existing Untreated lead status (key `untreated`, or
 * the active item labelled "Untreated"). Never creates dictionary items.
 */
export async function resolveUntreatedLeadStatus(
  workspaceId: string,
): Promise<
  | { ok: true; item: DictionaryItemRecord }
  | { ok: false; reason: "untreated_status_missing" | "untreated_status_inactive" }
> {
  const byKey = await findDictionaryItemByTypeAndKey(
    workspaceId,
    "lead_status",
    LEAD_UNTREATED_STATUS_KEY,
  );
  if (byKey?.isActive) {
    return { ok: true, item: byKey };
  }

  const byLabel = await findActiveDictionaryItemByTypeAndLabel(
    workspaceId,
    "lead_status",
    LEAD_UNTREATED_STATUS_LABEL,
  );
  if (byLabel) {
    return { ok: true, item: byLabel };
  }

  return { ok: false, reason: byKey ? "untreated_status_inactive" : "untreated_status_missing" };
}

function emptyWorkspaceSummary(
  workspace: WorkspaceRecord,
  skipped: LeadUntreatedWorkspaceSkipReason | null,
): LeadUntreatedWorkspaceSummary {
  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    skipped,
    scanned: 0,
    skippedInvalid: 0,
    eligible: 0,
    moved: 0,
    keptRecentTreatment: 0,
    lostRace: 0,
    truncated: false,
  };
}

export async function applyLeadUntreatedRuleForWorkspace(
  workspace: WorkspaceRecord,
  options: Required<
    Pick<
      LeadUntreatedRunOptions,
      "now" | "dryRun" | "thresholdDays" | "pageSize" | "maxUpdatesPerWorkspace"
    >
  > & { excludedProjectIds: string[] },
): Promise<LeadUntreatedWorkspaceSummary> {
  const newStatus = await findDictionaryItemByTypeAndKey(
    workspace.id,
    "lead_status",
    LEAD_NEW_STATUS_KEY,
  );
  if (!newStatus) {
    return emptyWorkspaceSummary(workspace, "new_status_missing");
  }

  const untreated = await resolveUntreatedLeadStatus(workspace.id);
  if (!untreated.ok) {
    return emptyWorkspaceSummary(workspace, untreated.reason);
  }
  if (untreated.item.id === newStatus.id) {
    return emptyWorkspaceSummary(workspace, "untreated_status_missing");
  }

  const summary = emptyWorkspaceSummary(workspace, null);
  const cutoff = leadUntreatedCutoff(options.now, options.thresholdDays);
  let afterId: string | null = null;

  while (true) {
    const page = await findStaleNewLeadCandidates({
      workspaceId: workspace.id,
      newStatusId: newStatus.id,
      cutoff,
      afterId,
      excludedProjectIds: options.excludedProjectIds,
      limit: options.pageSize,
    });
    const { candidates } = page;
    summary.scanned += candidates.length;
    summary.skippedInvalid += page.skippedInvalid;

    const leadIds = candidates.map((lead) => lead.id);
    const [activityAt, visitAt, auditAt] = await Promise.all([
      findLatestActivityAtByLead(workspace.id, leadIds),
      findLatestVisitSessionAtByLead(workspace.id, leadIds),
      findLatestTreatmentAuditAtByLead(workspace.id, leadIds, LEAD_TREATMENT_AUDIT_ACTIONS),
    ]);

    for (const lead of candidates) {
      const evaluation = evaluateLeadUntreated({
        statusId: lead.statusId,
        newStatusId: newStatus.id,
        archivedAt: lead.archivedAt,
        now: options.now,
        thresholdDays: options.thresholdDays,
        signals: {
          createdAt: lead.createdAt,
          inboundReceivedAt: parseInboundReceivedAt(lead.attributes),
          lastContactedAt: lead.lastContactedAt,
          lastActivityAt: activityAt.get(lead.id) ?? null,
          lastVisitSessionAt: visitAt.get(lead.id) ?? null,
          lastTreatmentAuditAt: auditAt.get(lead.id) ?? null,
        },
      });

      if (!evaluation.eligible) {
        if (evaluation.reason === "recent_treatment") {
          summary.keptRecentTreatment += 1;
        }
        continue;
      }

      if (summary.eligible >= options.maxUpdatesPerWorkspace) {
        summary.truncated = true;
        return summary;
      }
      summary.eligible += 1;

      if (options.dryRun) {
        continue;
      }

      const moved = await markLeadUntreatedIfStillNew({
        workspaceId: workspace.id,
        leadId: lead.id,
        newStatusId: newStatus.id,
        untreatedStatusId: untreated.item.id,
      });
      if (!moved) {
        summary.lostRace += 1;
        continue;
      }
      summary.moved += 1;

      await createAuditLog({
        workspaceId: workspace.id,
        actorId: workspace.createdBy,
        action: "lead.status_changed",
        entityType: "lead",
        entityId: lead.id,
        before: { statusId: newStatus.id },
        after: {
          statusId: untreated.item.id,
          automation: LEAD_UNTREATED_AUTOMATION_SOURCE,
          thresholdDays: options.thresholdDays,
          lastTreatmentAt: evaluation.lastTreatmentAt.toISOString(),
          idleDays: evaluation.idleDays,
        },
      });
    }

    if (!page.nextAfterId) {
      break;
    }
    afterId = page.nextAfterId;
  }

  return summary;
}

export async function runLeadUntreatedAutomation(
  options: LeadUntreatedRunOptions = {},
): Promise<LeadUntreatedRunSummary> {
  const now = options.now ?? new Date();
  const thresholdDays = options.thresholdDays ?? LEAD_UNTREATED_THRESHOLD_DAYS;
  const dryRun = options.dryRun ?? false;
  const resolved = {
    now,
    dryRun,
    thresholdDays,
    pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    maxUpdatesPerWorkspace: options.maxUpdatesPerWorkspace ?? DEFAULT_MAX_UPDATES_PER_WORKSPACE,
    excludedProjectIds: options.excludedProjectIds ?? [],
  };

  const allWorkspaces = await findAllWorkspaces();
  const workspaces = options.workspaceIds?.length
    ? allWorkspaces.filter((workspace) => options.workspaceIds!.includes(workspace.id))
    : allWorkspaces;

  const results: LeadUntreatedWorkspaceSummary[] = [];
  for (const workspace of workspaces) {
    try {
      results.push(await applyLeadUntreatedRuleForWorkspace(workspace, resolved));
    } catch (error) {
      captureError(error, {
        code: "LEAD_UNTREATED_AUTOMATION_FAILED",
        workspaceId: workspace.id,
      });
      results.push(emptyWorkspaceSummary(workspace, "failed"));
    }
  }

  return {
    dryRun,
    thresholdDays,
    cutoff: leadUntreatedCutoff(now, thresholdDays).toISOString(),
    workspaces: results.length,
    scanned: results.reduce((total, result) => total + result.scanned, 0),
    skippedInvalid: results.reduce((total, result) => total + result.skippedInvalid, 0),
    eligible: results.reduce((total, result) => total + result.eligible, 0),
    moved: results.reduce((total, result) => total + result.moved, 0),
    workspacesSkipped: results.filter((result) => result.skipped !== null).length,
    results,
  };
}
