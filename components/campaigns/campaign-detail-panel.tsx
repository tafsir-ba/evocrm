"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildLeadEnrollmentPayload,
  buildOpportunityEnrollmentPayload,
  CampaignEnrollmentActions,
  CampaignEnrollmentSelector,
  getActiveEnrollmentTargetIds,
  getEnrollmentSelectionError,
} from "@/components/campaigns/campaign-enrollment-selector";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Textarea } from "@/components/ui/input";
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
  stepCount: number;
  enrollmentCount: number;
};

type CampaignStep = {
  id: string;
  order: number;
  delayDays: number;
  sendTime: string;
  fromName: string;
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

type StepFormState = {
  order: string;
  delayDays: string;
  sendTime: string;
  fromName: string;
  subject: string;
  body: string;
};

const emptyStepForm: StepFormState = {
  order: "1",
  delayDays: "0",
  sendTime: "09:00",
  fromName: "",
  subject: "",
  body: "",
};

type CampaignDetailPanelProps = {
  workspaceSlug: string;
  campaignId: string;
  canUpdate: boolean;
  canArchive: boolean;
};

export function CampaignDetailPanel({
  workspaceSlug,
  campaignId,
  canUpdate,
  canArchive,
}: CampaignDetailPanelProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sends, setSends] = useState<SendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [stepDrawerOpen, setStepDrawerOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState<StepFormState>(emptyStepForm);
  const [stepFormError, setStepFormError] = useState<string | null>(null);
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<string[]>([]);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [previewStep, setPreviewStep] = useState<CampaignStep | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: "", defaultFromName: "" });
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);
    setForbidden(false);

    try {
      const [campaignRes, stepsRes, enrollRes, sendsRes] = await Promise.all([
        fetch(apiBase),
        fetch(`${apiBase}/steps`),
        fetch(`${apiBase}/enrollments`),
        fetch(`${apiBase}/sends`),
      ]);

      if (campaignRes.status === 403) {
        setForbidden(true);
        return;
      }

      const [campaignPayload, stepsPayload, enrollPayload, sendsPayload] =
        await Promise.all([
          campaignRes.json(),
          stepsRes.json(),
          enrollRes.json(),
          sendsRes.json(),
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

      setCampaign(campaignPayload.data?.campaign ?? null);
      setSteps(stepsRes.ok ? (stepsPayload.data?.steps ?? []) : []);
      setEnrollments(enrollRes.ok ? (enrollPayload.data ?? []) : []);
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

  function openSettings() {
    if (!campaign) return;
    setSettingsForm({
      name: campaign.name,
      defaultFromName: campaign.defaultFromName ?? "",
    });
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function handleSettingsSave(event: React.FormEvent) {
    event.preventDefault();
    setSettingsError(null);
    setActionPending(true);

    try {
      const response = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          defaultFromName: settingsForm.defaultFromName.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setSettingsError(payload.error?.message ?? "Failed to save settings.");
        return;
      }
      setSettingsOpen(false);
      await loadAll();
    } catch {
      setSettingsError("Failed to save settings.");
    } finally {
      setActionPending(false);
    }
  }

  function openStepDrawer(step?: CampaignStep) {
    if (step) {
      setEditingStepId(step.id);
      setStepForm({
        order: String(step.order),
        delayDays: String(step.delayDays),
        sendTime: step.sendTime,
        fromName: step.fromName,
        subject: step.subject,
        body: step.body,
      });
    } else {
      setEditingStepId(null);
      setStepForm({
        ...emptyStepForm,
        order: String(steps.length + 1),
        fromName: campaign?.defaultFromName ?? campaign?.name ?? "",
      });
    }
    setStepFormError(null);
    setStepDrawerOpen(true);
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

  async function handleStepSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStepFormError(null);
    setActionPending(true);

    const body = {
      order: parseInt(stepForm.order, 10),
      delayDays: parseInt(stepForm.delayDays, 10),
      sendTime: stepForm.sendTime,
      fromName: stepForm.fromName.trim(),
      channel: "email" as const,
      subject: stepForm.subject.trim(),
      body: stepForm.body.trim(),
    };

    try {
      const url = editingStepId
        ? `${apiBase}/steps/${editingStepId}`
        : `${apiBase}/steps`;
      const response = await fetch(url, {
        method: editingStepId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        setStepFormError(payload.error?.message ?? "Failed to save step.");
        return;
      }

      setStepDrawerOpen(false);
      await loadAll();
    } catch {
      setStepFormError("Failed to save step.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleEnroll() {
    if (!campaign) {
      return;
    }

    const selectionError = getEnrollmentSelectionError(
      campaign.audienceType,
      selectedEnrollmentIds,
    );

    if (selectionError) {
      setEnrollError(selectionError);
      return;
    }

    setEnrollError(null);
    setActionPending(true);

    const failures: string[] = [];
    let enrolledCount = 0;

    try {
      for (const targetId of selectedEnrollmentIds) {
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
              <Button variant="secondary" disabled={actionPending} onClick={openSettings}>
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
            {canArchive && campaign.status === "draft" && campaign.enrollmentCount === 0 && (
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

      {/* Steps */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Email steps</h2>
          {stepsEditable && (
            <Button
              size="sm"
              leadingIcon={<IconPlus size={14} />}
              onClick={() => openStepDrawer()}
            >
              Add step
            </Button>
          )}
        </div>
        {steps.length === 0 ? (
          <EmptyState
            compact
            title="No steps yet"
            description="Add at least one email step before enrolling recipients."
          />
        ) : (
          <ol className="space-y-3">
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-line)]"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-canvas)] border border-[var(--color-line)] text-[12px] font-semibold">
                  {step.order}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)]">{step.subject}</p>
                  <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                    Day {step.delayDays} · {step.sendTime} · From {step.fromName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPreviewStep(step)}>
                    Preview
                  </Button>
                  {stepsEditable && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openStepDrawer(step)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={actionPending}
                        onClick={() => void handleDeleteStep(step.id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {!stepsEditable && campaign.status === "active" && (
          <p className="mt-3 text-[12px] text-[var(--color-ink-muted)]">
            Pause the campaign to edit steps.
          </p>
        )}
      </Card>

      {/* Enrollments */}
      <Card className="mb-6">
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">Enrollments</h2>
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
          <EmptyState compact title="No enrollments" description="Manually enroll a lead or opportunity." />
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
        open={stepDrawerOpen}
        onClose={() => setStepDrawerOpen(false)}
        title={editingStepId ? "Edit step" : "Add step"}
        className="w-[min(100%,480px)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStepDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="campaign-step-form" disabled={actionPending}>
              {actionPending ? "Saving…" : "Save step"}
            </Button>
          </div>
        }
      >
        <form id="campaign-step-form" onSubmit={handleStepSubmit} className="space-y-4">
          {stepFormError && (
            <p className="text-[13px] text-[var(--color-danger)]">{stepFormError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Order</Label>
              <Input
                type="number"
                min={1}
                value={stepForm.order}
                onChange={(e) => setStepForm((f) => ({ ...f, order: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>Delay (days)</Label>
              <Input
                type="number"
                min={0}
                value={stepForm.delayDays}
                onChange={(e) => setStepForm((f) => ({ ...f, delayDays: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sending time</Label>
              <Input
                type="time"
                value={stepForm.sendTime}
                onChange={(e) => setStepForm((f) => ({ ...f, sendTime: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>From name</Label>
              <Input
                value={stepForm.fromName}
                onChange={(e) => setStepForm((f) => ({ ...f, fromName: e.target.value }))}
                required
                maxLength={120}
                placeholder="e.g. Grosvenor Vistas"
              />
            </div>
          </div>
          <div>
            <Label>Subject</Label>
            <Input
              value={stepForm.subject}
              onChange={(e) => setStepForm((f) => ({ ...f, subject: e.target.value }))}
              required
              maxLength={500}
            />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea
              value={stepForm.body}
              onChange={(e) => setStepForm((f) => ({ ...f, body: e.target.value }))}
              required
              rows={6}
              className="max-h-[min(40dvh,280px)] overflow-y-auto resize-y"
            />
          </div>
        </form>
      </Drawer>

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

      <Drawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Campaign settings"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="campaign-settings-form" disabled={actionPending}>
              {actionPending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <form id="campaign-settings-form" onSubmit={handleSettingsSave} className="space-y-4">
          {settingsError && (
            <p className="text-[13px] text-[var(--color-danger)]">{settingsError}</p>
          )}
          <div>
            <Label>Campaign name</Label>
            <Input
              value={settingsForm.name}
              onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
              required
              maxLength={200}
            />
          </div>
          <div>
            <Label>Default from name</Label>
            <Input
              value={settingsForm.defaultFromName}
              onChange={(e) =>
                setSettingsForm((f) => ({ ...f, defaultFromName: e.target.value }))
              }
              maxLength={120}
              placeholder="Pre-fills new steps"
            />
          </div>
        </form>
      </Drawer>
    </>
  );
}
