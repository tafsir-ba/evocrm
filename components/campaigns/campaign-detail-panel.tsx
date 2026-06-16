"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildLeadEnrollmentPayload,
  buildOpportunityEnrollmentPayload,
  CampaignEnrollmentActions,
  CampaignEnrollmentSelector,
  getActiveEnrollmentTargetIds,
  getEnrollmentSelectionError,
} from "@/components/campaigns/campaign-enrollment-selector";
import { CampaignJourneySection } from "@/components/campaigns/campaign-journey-section";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronLeft, IconMail, IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  audienceType: "leads" | "opportunities";
  frequency: string | null;
  defaultFromName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  sendingDomainId: string | null;
  autoEnrollmentEnabled?: boolean;
  enrollmentTrigger?: string;
  stepCount: number;
  enrollmentCount: number;
};

type CampaignStep = {
  id: string;
  order: number;
  name: string | null;
  delayDays: number;
  sendTime: string;
  fromName: string | null;
  status: "draft" | "ready" | "active" | "paused";
  subject: string;
  body: string;
  documentIds: string[];
};

type EnrollmentScheduledStep = {
  stepOrder: number;
  subject: string;
  scheduledAt: string | null;
  state: "sent" | "pending" | "paused" | "cancelled";
};

type Enrollment = {
  id: string;
  status: string;
  leadId: string | null;
  opportunityId: string | null;
  leadName: string | null;
  leadEmail: string | null;
  leadEmailConsentStatus: string | null;
  opportunityLabel: string | null;
  currentStep: number;
  nextSendAt: string;
  lastSentAt: string | null;
  failureReason: string | null;
  warnings: string[];
  scheduledSteps: EnrollmentScheduledStep[];
};

type EnrollmentCandidate =
  | {
      audienceType: "leads";
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      emailConsentStatus: string;
      createdAt: string;
    }
  | {
      audienceType: "opportunities";
      id: string;
      createdAt: string;
      lead: { id: string; fullName: string; email: string | null } | null;
      property: { id: string; title: string; reference: string | null } | null;
      status: { label: string } | null;
    };

type SendLog = {
  id: string;
  status: string;
  leadName: string | null;
  stepSubject: string | null;
  scheduledFor: string;
  sentAt: string | null;
  providerMessageId: string | null;
  error: string | null;
};

type CampaignDetailPanelProps = {
  workspaceSlug: string;
  campaignId: string;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
};

export function CampaignDetailPanel({
  workspaceSlug,
  campaignId,
  canUpdate,
  canArchive,
  canDelete,
}: CampaignDetailPanelProps) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollmentCandidates, setEnrollmentCandidates] = useState<EnrollmentCandidate[]>([]);
  const [sends, setSends] = useState<SendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<string[]>([]);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [previewStep, setPreviewStep] = useState<CampaignStep | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);
    setForbidden(false);

    try {
      const [campaignRes, stepsRes, enrollRes, sendsRes, candidatesRes] = await Promise.all([
        fetch(apiBase),
        fetch(`${apiBase}/steps`),
        fetch(`${apiBase}/enrollments`),
        fetch(`${apiBase}/sends`),
        fetch(`${apiBase}/enrollment-candidates`),
      ]);

      if (campaignRes.status === 403) {
        setForbidden(true);
        return;
      }

      const [campaignPayload, stepsPayload, enrollPayload, sendsPayload, candidatesPayload] =
        await Promise.all([
          campaignRes.json(),
          stepsRes.json(),
          enrollRes.json(),
          sendsRes.json(),
          candidatesRes.json(),
        ]);

      if (!campaignRes.ok) {
        setLoadError(campaignPayload.error?.message ?? "Failed to load campaign.");
        return;
      }

      const warnings: string[] = [];

      if (!stepsRes.ok) {
        warnings.push("Failed to load campaign steps.");
      }

      if (!enrollRes.ok) {
        warnings.push("Failed to load enrollments.");
      }

      if (!sendsRes.ok) {
        warnings.push("Failed to load send history.");
      }

      if (!candidatesRes.ok) {
        warnings.push("Failed to load enrollment suggestions.");
      }

      setCampaign(campaignPayload.data?.campaign ?? null);
      setSteps(stepsRes.ok ? (stepsPayload.data?.steps ?? []) : []);
      setEnrollments(enrollRes.ok ? (enrollPayload.data ?? []) : []);
      setEnrollmentCandidates(candidatesRes.ok ? (candidatesPayload.data ?? []) : []);
      setSends(sendsRes.ok ? (sendsPayload.data ?? []) : []);
      setLoadWarning(warnings.length > 0 ? warnings.join(" ") : null);
    } catch {
      setLoadError("Failed to load campaign.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const reloadAfterCampaignMutation = useCallback(async () => {
    await loadAll();
    window.setTimeout(() => {
      void loadAll();
    }, 2500);
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const isArchived = campaign?.status === "archived";
  const stepsEditable =
    canUpdate && campaign && (campaign.status === "draft" || campaign.status === "paused");
  const canManageEnrollments = canUpdate && campaign && campaign.status === "active";

  const excludedEnrollmentTargetIds = useMemo(() => {
    if (!campaign) {
      return [];
    }

    return getActiveEnrollmentTargetIds(enrollments, campaign.audienceType);
  }, [campaign, enrollments]);

  function handleEnrollmentSelectionChange(ids: string[]) {
    setSelectedEnrollmentIds(ids);
    if (ids.length > 0) {
      setEnrollError(null);
    }
  }

  async function runAction(path: string, method = "PATCH") {
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`${apiBase}${path}`, { method });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error?.message ?? "Action failed.");
        return;
      }
      await reloadAfterCampaignMutation();
    } catch {
      setActionError("Action failed.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleActivate() {
    setActionPending(true);
    setActionError(null);

    try {
      const response = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setActionError(payload.error?.message ?? "Activation failed.");
        return;
      }

      await reloadAfterCampaignMutation();
    } catch {
      setActionError("Activation failed.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm("Archive this campaign? Pending sends will be cancelled.")) {
      return;
    }

    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(apiBase, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        setActionError(payload.error?.message ?? "Archive failed.");
        return;
      }
      await loadAll();
    } catch {
      setActionError("Archive failed.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleRestore() {
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`${apiBase}/restore`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error?.message ?? "Restore failed.");
        return;
      }
      await loadAll();
    } catch {
      setActionError("Restore failed.");
    } finally {
      setActionPending(false);
    }
  }

  async function handlePurge() {
    if (!window.confirm("Permanently delete this draft campaign? This cannot be undone.")) {
      return;
    }

    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`${apiBase}/purge`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error?.message ?? "Delete failed.");
        return;
      }
      window.location.href = workspacePath(workspaceSlug, "dripping");
    } catch {
      setActionError("Delete failed.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!window.confirm("Delete this step?")) return;

    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch(`${apiBase}/steps/${stepId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        setActionError(payload.error?.message ?? "Failed to delete step.");
        return;
      }
      await loadAll();
    } catch {
      setActionError("Failed to delete step.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleEnroll(targetIds = selectedEnrollmentIds) {
    if (!campaign) {
      return;
    }

    const selectionError = getEnrollmentSelectionError(campaign.audienceType, targetIds);

    if (selectionError) {
      setEnrollError(selectionError);
      return;
    }

    setEnrollError(null);
    setActionPending(true);

    const failures: string[] = [];
    let enrolledCount = 0;

    try {
      for (const targetId of targetIds) {
        const body =
          campaign.audienceType === "leads"
            ? buildLeadEnrollmentPayload(targetId)
            : buildOpportunityEnrollmentPayload(targetId);

        const response = await fetch(`${apiBase}/enrollments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json();

        if (!response.ok) {
          failures.push(payload.error?.message ?? "Enrollment failed.");
          continue;
        }

        enrolledCount += 1;
      }

      if (enrolledCount > 0) {
        setSelectedEnrollmentIds([]);
        await reloadAfterCampaignMutation();
      }

      if (failures.length > 0) {
        setEnrollError(
          enrolledCount > 0
            ? `${enrolledCount} enrolled. ${failures[0]}`
            : failures[0],
        );
      }
    } catch {
      setEnrollError("Enrollment failed.");
    } finally {
      setActionPending(false);
    }
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view this campaign."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (loadError || !campaign) {
    return (
      <ErrorState
        title="Could not load campaign"
        description={loadError ?? "Campaign not found."}
        primaryAction={{ label: "Retry", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href={workspacePath(workspaceSlug, "dripping")}
          className="text-[13px] text-[var(--color-brand-700)] inline-flex items-center gap-1 hover:underline"
        >
          <IconChevronLeft size={14} /> Back to Dripping
        </Link>
      </div>

      <PageHeader
        title={campaign.name}
        description={`${campaign.audienceType} campaign · ${campaign.stepCount} steps · ${campaign.enrollmentCount} enrolled`}
        meta={<StatusBadge status={campaign.status} size="sm" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canUpdate && !isArchived && (
              <Button
                variant="secondary"
                disabled={actionPending}
                onClick={() =>
                  router.push(workspacePath(workspaceSlug, `dripping/${campaignId}/edit`))
                }
              >
                Edit settings
              </Button>
            )}
            {canUpdate && isArchived && (
              <Button disabled={actionPending} onClick={() => void handleRestore()}>
                Restore
              </Button>
            )}
            {canUpdate && campaign.status !== "archived" ? (
              <>
                {campaign.status === "active" && (
                  <Button
                    variant="secondary"
                    disabled={actionPending}
                    onClick={() => void runAction("/pause")}
                  >
                    Pause
                  </Button>
                )}
                {campaign.status === "paused" && (
                  <Button
                    variant="secondary"
                    disabled={actionPending}
                    onClick={() => void runAction("/resume")}
                  >
                    Resume
                  </Button>
                )}
                {campaign.status === "draft" && steps.length > 0 && (
                  <Button disabled={actionPending} onClick={() => void handleActivate()}>
                    Activate
                  </Button>
                )}
                {canArchive && (
                  <Button
                    variant="secondary"
                    disabled={actionPending}
                    onClick={() => void handleArchive()}
                  >
                    Archive
                  </Button>
                )}
              </>
            ) : null}
            {canDelete && campaign.status === "draft" && campaign.enrollmentCount === 0 && (
              <Button
                variant="secondary"
                disabled={actionPending}
                onClick={() => void handlePurge()}
              >
                Delete
              </Button>
            )}
          </div>
        }
      />

      {loadWarning && (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
          {loadWarning}
        </div>
      )}

      {actionError && (
        <p className="mb-4 text-[12.5px] text-[var(--color-danger)]">{actionError}</p>
      )}

      {isArchived && (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
          This campaign is <strong>archived</strong>. Enrollments and sends are disabled. Restore it
          to draft to edit or re-activate.
        </div>
      )}

      {/* Campaign journey */}
      <CampaignJourneySection
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        campaignName={campaign.name}
        campaignStatus={campaign.status}
        audienceType={campaign.audienceType}
        senderName={campaign.senderName ?? campaign.defaultFromName}
        senderEmail={campaign.senderEmail}
        sendingDomainId={campaign.sendingDomainId}
        enrollmentLabel={
          campaign.autoEnrollmentEnabled
            ? `${campaign.enrollmentTrigger?.replaceAll("_", " ") ?? "rules match"}`
            : "manual enrollment is used"
        }
        steps={steps}
        stepsEditable={Boolean(stepsEditable)}
        canUpdate={canUpdate}
        onStepsChange={() => void loadAll()}
        onActionError={setActionError}
      />

      {/* Enrollments */}
      <Card className="mb-6">
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">Enrollments</h2>

        {campaign.status === "draft" && (
          <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
            Activate this campaign before enrolling recipients.
            {enrollmentCandidates.length > 0
              ? ` ${enrollmentCandidates.length} ${campaign.audienceType === "leads" ? "lead" : "opportunity"}${enrollmentCandidates.length === 1 ? "" : "s"} created since this campaign was set up can be enrolled after activation.`
              : ""}
          </div>
        )}

        {campaign.status === "paused" && canUpdate && (
          <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
            Resume this campaign to enroll new recipients.
          </div>
        )}

        {enrollmentCandidates.length > 0 && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">
                Suggested for enrollment
              </p>
              {canManageEnrollments ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={actionPending}
                  onClick={() =>
                    void handleEnroll(enrollmentCandidates.map((candidate) => candidate.id))
                  }
                >
                  Enroll all suggested
                </Button>
              ) : null}
            </div>
            <ul className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)]">
              {enrollmentCandidates.map((candidate) => (
                <li key={candidate.id} className="px-3 py-2.5 text-[13px]">
                  {candidate.audienceType === "leads" ? (
                    <>
                      <p className="font-medium text-[var(--color-ink)]">{candidate.fullName}</p>
                      <p className="text-[12px] text-[var(--color-ink-muted)]">
                        {candidate.email ?? "No email"}
                        {candidate.phone ? ` · ${candidate.phone}` : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-[var(--color-ink)]">
                        {candidate.lead?.fullName ?? "Unknown lead"}
                      </p>
                      <p className="text-[12px] text-[var(--color-ink-muted)]">
                        {candidate.property?.title ??
                          candidate.property?.reference ??
                          "No property"}
                        {candidate.status ? ` · ${candidate.status.label}` : ""}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canManageEnrollments && (
          <div className="mb-4 space-y-3">
            <CampaignEnrollmentSelector
              workspaceSlug={workspaceSlug}
              audienceType={campaign.audienceType}
              selectedIds={selectedEnrollmentIds}
              onSelectionChange={handleEnrollmentSelectionChange}
              excludedTargetIds={excludedEnrollmentTargetIds}
              disabled={actionPending}
            />
            <CampaignEnrollmentActions
              selectedIds={selectedEnrollmentIds}
              onEnroll={() => void handleEnroll()}
              enrolling={actionPending}
              disabled={actionPending}
              error={enrollError}
            />
          </div>
        )}
        {enrollments.length === 0 ? (
          <EmptyState
            compact
            title="No enrollments"
            description={
              campaign.status === "draft"
                ? "No recipients enrolled yet. Activate the campaign, then enroll suggested leads or search manually."
                : campaign.status === "active"
                  ? enrollmentCandidates.length > 0
                    ? "No recipients enrolled yet. Use the suggestions above or search below."
                    : "Search for a lead or opportunity below to enroll."
                  : "Manually enroll a lead or opportunity once the campaign is active."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pr-4">Recipient</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Scheduled drips</th>
                  <th className="py-2">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="border-b border-[var(--color-line)]">
                    <td className="py-2 pr-4">
                      {enrollment.leadName ?? enrollment.opportunityLabel ?? "—"}
                      {enrollment.leadEmail && (
                        <span className="block text-[11px] text-[var(--color-ink-muted)]">
                          {enrollment.leadEmail}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 capitalize">{enrollment.status}</td>
                    <td className="py-2 pr-4">
                      <ul className="space-y-1">
                        {(enrollment.scheduledSteps ?? []).map((scheduledStep) => (
                          <li key={`${enrollment.id}-${scheduledStep.stepOrder}`}>
                            <span className="font-medium">
                              Step {scheduledStep.stepOrder}
                            </span>
                            {" · "}
                            {scheduledStep.subject}
                            {" — "}
                            {scheduledStep.state === "sent" ? (
                              <span className="text-[var(--color-ink-muted)]">Sent</span>
                            ) : scheduledStep.state === "paused" ? (
                              <span className="text-[var(--color-warning)]">Paused</span>
                            ) : scheduledStep.state === "cancelled" ? (
                              <span className="text-[var(--color-ink-muted)]">Cancelled</span>
                            ) : scheduledStep.scheduledAt ? (
                              new Date(scheduledStep.scheduledAt).toLocaleString()
                            ) : (
                              "—"
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2">
                      {enrollment.warnings.length > 0 ? (
                        <span className="text-[11px] text-[var(--color-warning)]">
                          {enrollment.warnings.join(" ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Send logs */}
      <Card>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">Send log</h2>
        {sends.length === 0 ? (
          <EmptyState
            compact
            title="No sends yet"
            description="Send logs appear after activation, enrollment, or scheduled processing."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
                  <th className="py-2 pr-4">Recipient</th>
                  <th className="py-2 pr-4">Step</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Scheduled</th>
                  <th className="py-2 pr-4">Sent</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((send) => (
                  <tr key={send.id} className="border-b border-[var(--color-line)]">
                    <td className="py-2 pr-4">{send.leadName ?? "—"}</td>
                    <td className="py-2 pr-4">{send.stepSubject ?? "—"}</td>
                    <td className="py-2 pr-4 capitalize">{send.status}</td>
                    <td className="py-2 pr-4">
                      {new Date(send.scheduledFor).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      {send.sentAt ? new Date(send.sentAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 text-[11px] text-[var(--color-ink-muted)]">
                      {send.providerMessageId && `ID: ${send.providerMessageId}`}
                      {send.error && send.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={!!previewStep}
        onClose={() => setPreviewStep(null)}
        title="Email preview"
      >
        <p className="text-[12px] text-[var(--color-ink-muted)] mb-4">
          Preview only — document attachments are not included in sent emails in V1.
        </p>
        {previewStep && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase text-[var(--color-ink-muted)] font-semibold">From</p>
              <p className="text-[14px] font-medium mt-1">{previewStep.fromName}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--color-ink-muted)] font-semibold">Subject</p>
              <p className="text-[14px] font-medium mt-1">{previewStep.subject}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-[var(--color-ink-muted)] font-semibold">Body</p>
              <div className="mt-2 p-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] text-[13px] whitespace-pre-wrap">
                {previewStep.body}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
              <IconMail size={14} />
              <span>Unsubscribe link will be appended when sent.</span>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
