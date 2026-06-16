"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import {
  buildCampaignSummary,
  calculateCampaignDayOffset,
  formatStepDelayLabel,
} from "@/lib/campaign-email";
import { IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

export type JourneyStep = {
  id: string;
  order: number;
  name: string | null;
  delayDays: number;
  sendTime: string;
  status: "draft" | "ready" | "active" | "paused";
  subject: string;
  body: string;
};

type ReadinessItem = {
  key: string;
  label: string;
  passed: boolean;
  requiredFix?: string;
};

type SendingDomainOption = {
  id: string;
  domain: string;
  status: string;
  defaultSenderEmail: string | null;
};

type CampaignJourneySectionProps = {
  workspaceSlug: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  audienceType: string;
  senderName: string | null;
  senderEmail: string | null;
  sendingDomainId: string | null;
  enrollmentLabel: string;
  steps: JourneyStep[];
  stepsEditable: boolean;
  canUpdate: boolean;
  onStepsChange: () => void;
  onActionError: (message: string) => void;
};

const STEP_STATUS_TONES: Record<JourneyStep["status"], "muted" | "success" | "warn" | "info"> = {
  draft: "muted",
  ready: "success",
  active: "info",
  paused: "warn",
};

export function CampaignJourneySection({
  workspaceSlug,
  campaignId,
  campaignName,
  campaignStatus,
  audienceType,
  senderName,
  senderEmail,
  sendingDomainId,
  enrollmentLabel,
  steps,
  stepsEditable,
  canUpdate,
  onStepsChange,
  onActionError,
}: CampaignJourneySectionProps) {
  const router = useRouter();
  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}`;
  const [orderedSteps, setOrderedSteps] = useState(steps);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>([]);
  const [domains, setDomains] = useState<SendingDomainOption[]>([]);
  const [domainsForbidden, setDomainsForbidden] = useState(false);
  const [senderEmails, setSenderEmails] = useState<string[]>([]);
  const [localSenderName, setLocalSenderName] = useState(senderName ?? "");
  const [localSenderEmail, setLocalSenderEmail] = useState(senderEmail ?? "");
  const [localSendingDomainId, setLocalSendingDomainId] = useState(sendingDomainId ?? "");

  useEffect(() => {
    setOrderedSteps(steps);
  }, [steps]);

  useEffect(() => {
    setLocalSenderName(senderName ?? "");
    setLocalSenderEmail(senderEmail ?? "");
    setLocalSendingDomainId(sendingDomainId ?? "");
  }, [senderEmail, senderName, sendingDomainId]);

  const loadReadiness = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/readiness`);
      const payload = await response.json();
      if (response.ok) {
        setReadinessItems(payload.data?.readiness?.items ?? []);
      }
    } catch {
      // Non-blocking.
    }
  }, [apiBase]);

  const loadDomains = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/sending-domains`);
      const payload = await response.json();

      if (response.status === 403) {
        setDomainsForbidden(true);
        setDomains([]);
        return;
      }

      setDomainsForbidden(false);
      if (response.ok) {
        setDomains(payload.data?.domains ?? []);
      }
    } catch {
      // Non-blocking.
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadReadiness();
    void loadDomains();
  }, [loadDomains, loadReadiness, orderedSteps]);

  useEffect(() => {
    if (!localSendingDomainId) {
      setSenderEmails([]);
      return;
    }

    void (async () => {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/sender-emails?sendingDomainId=${localSendingDomainId}`,
      );
      const payload = await response.json();
      if (response.ok) {
        setSenderEmails(payload.data?.senderEmails ?? []);
      }
    })();
  }, [localSendingDomainId, workspaceSlug]);

  const totalDays = useMemo(() => {
    if (orderedSteps.length === 0) {
      return 0;
    }
    return calculateCampaignDayOffset(orderedSteps, orderedSteps[orderedSteps.length - 1].order);
  }, [orderedSteps]);

  const summary = buildCampaignSummary({
    stepCount: orderedSteps.length,
    totalDays,
    enrollmentLabel,
    senderName: localSenderName,
    senderEmail: localSenderEmail,
  });

  const verifiedDomains = domains.filter((domain) => domain.status === "verified");

  async function persistSenderSettings() {
    if (!canUpdate) {
      return;
    }

    setActionPending(true);
    try {
      const response = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: localSenderName || null,
          senderEmail: localSenderEmail || null,
          sendingDomainId: localSendingDomainId || null,
          defaultFromName: localSenderName || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        onActionError(payload.error?.message ?? "Failed to save sender settings.");
        return;
      }
      onStepsChange();
      void loadReadiness();
    } catch {
      onActionError("Failed to save sender settings.");
    } finally {
      setActionPending(false);
    }
  }

  async function persistReorder(nextSteps: JourneyStep[]) {
    setActionPending(true);
    try {
      const response = await fetch(`${apiBase}/steps/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIds: nextSteps.map((step) => step.id) }),
      });
      const payload = await response.json();
      if (!response.ok) {
        onActionError(payload.error?.message ?? "Failed to reorder steps.");
        setOrderedSteps(steps);
        return;
      }
      onStepsChange();
    } catch {
      onActionError("Failed to reorder steps.");
      setOrderedSteps(steps);
    } finally {
      setActionPending(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId || !stepsEditable) {
      return;
    }

    const current = [...orderedSteps];
    const fromIndex = current.findIndex((step) => step.id === draggingId);
    const toIndex = current.findIndex((step) => step.id === targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const renumbered = current.map((step, index) => ({ ...step, order: index + 1 }));
    setOrderedSteps(renumbered);
    setDraggingId(null);
    void persistReorder(renumbered);
  }

  async function handleDuplicate(stepId: string) {
    setActionPending(true);
    try {
      const response = await fetch(`${apiBase}/steps/${stepId}/duplicate`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        onActionError(payload.error?.message ?? "Failed to duplicate step.");
        return;
      }
      onStepsChange();
    } catch {
      onActionError("Failed to duplicate step.");
    } finally {
      setActionPending(false);
    }
  }

  async function handlePauseStep(stepId: string) {
    setActionPending(true);
    try {
      const response = await fetch(`${apiBase}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        onActionError(payload.error?.message ?? "Failed to pause step.");
        return;
      }
      onStepsChange();
    } catch {
      onActionError("Failed to pause step.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!window.confirm("Delete this draft step?")) {
      return;
    }

    setActionPending(true);
    try {
      const response = await fetch(`${apiBase}/steps/${stepId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        onActionError(payload.error?.message ?? "Failed to delete step.");
        return;
      }
      onStepsChange();
    } catch {
      onActionError("Failed to delete step.");
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className="space-y-6 mb-6">
      <Card>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-1">Campaign journey</h2>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">{summary}</p>
      </Card>

      <Card>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-4">Campaign settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sender-domain">Sending domain</Label>
            <select
              id="sender-domain"
              className="mt-1 w-full h-9 rounded-md border border-[var(--color-line)] px-3 text-[13px]"
              value={localSendingDomainId}
              disabled={!canUpdate || actionPending || domainsForbidden}
              onChange={(event) => {
                setLocalSendingDomainId(event.target.value);
                setLocalSenderEmail("");
              }}
            >
              <option value="">Select verified domain</option>
              {verifiedDomains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.domain}
                </option>
              ))}
            </select>
            {domainsForbidden ? (
              <p className="text-[12px] text-[var(--color-ink-muted)] mt-2">
                You do not have permission to view sending domains. Ask a workspace owner to
                configure them in{" "}
                <Link
                  href={workspacePath(workspaceSlug, "settings/sending-domains")}
                  className="text-[var(--color-brand-600)] hover:underline"
                >
                  Settings → Sending Domains
                </Link>
                .
              </p>
            ) : verifiedDomains.length === 0 ? (
              <p className="text-[12px] text-[var(--color-ink-muted)] mt-2">
                No verified sending domain yet.{" "}
                <Link
                  href={workspacePath(workspaceSlug, "settings/sending-domains")}
                  className="text-[var(--color-brand-600)] hover:underline"
                >
                  Add sending domain
                </Link>
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="sender-name">Sender name</Label>
            <Input
              id="sender-name"
              className="mt-1"
              value={localSenderName}
              disabled={!canUpdate || actionPending}
              onChange={(event) => setLocalSenderName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sender-email">Sender email</Label>
            <select
              id="sender-email"
              className="mt-1 w-full h-9 rounded-md border border-[var(--color-line)] px-3 text-[13px]"
              value={localSenderEmail}
              disabled={!canUpdate || actionPending || !localSendingDomainId}
              onChange={(event) => setLocalSenderEmail(event.target.value)}
            >
              <option value="">Select sender email</option>
              {senderEmails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {canUpdate ? (
              <Button disabled={actionPending} onClick={() => void persistSenderSettings()}>
                Save sender settings
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {readinessItems.length > 0 ? (
        <Card>
          <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-3">Campaign readiness</h2>
          <ul className="space-y-2">
            {readinessItems.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-[13px]">
                <span className={item.passed ? "text-[var(--color-success)]" : "text-[var(--color-ink-faint)]"}>
                  {item.passed ? "✓" : "○"}
                </span>
                <span className={item.passed ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3">
          <p className="text-[12px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
            Trigger
          </p>
          <p className="text-[13px] text-[var(--color-ink)] mt-1">
            A contact enters this campaign when: {enrollmentLabel}
          </p>
          <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
            Audience: {audienceType} · Status: {campaignStatus}
          </p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Email sequence</h2>
          {stepsEditable ? (
            <Button
              size="sm"
              leadingIcon={<IconPlus size={14} />}
              onClick={() =>
                router.push(workspacePath(workspaceSlug, `dripping/${campaignId}/steps/new`))
              }
            >
              Add step
            </Button>
          ) : null}
        </div>

        {orderedSteps.length === 0 ? (
          <EmptyState
            compact
            title="Start your campaign journey"
            description="Add your first email touchpoint to begin building this drip campaign."
            primaryAction={
              stepsEditable
                ? {
                    label: "Add first email",
                    onClick: () =>
                      router.push(workspacePath(workspaceSlug, `dripping/${campaignId}/steps/new`)),
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-0">
            {orderedSteps.map((step, index) => {
              const dayOffset = calculateCampaignDayOffset(orderedSteps, step.order);
              const stepLabel = step.name || step.subject || `Email ${step.order}`;
              const missingSubject = !step.subject.trim();
              const missingBody = !step.body.trim();

              return (
                <div key={step.id}>
                  {index > 0 ? (
                    <div className="py-3 text-center text-[12px] text-[var(--color-ink-muted)]">
                      ↓ Wait {step.delayDays} day
                      {step.delayDays === 1 ? "" : "s"}
                    </div>
                  ) : null}

                  <div
                    draggable={stepsEditable}
                    onDragStart={() => setDraggingId(step.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(step.id)}
                    className={`rounded-xl border border-[var(--color-line)] p-4 bg-white ${
                      draggingId === step.id ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {stepsEditable ? (
                        <button
                          type="button"
                          className="cursor-grab text-[var(--color-ink-faint)] pt-1"
                          aria-label="Reorder step"
                        >
                          ☰
                        </button>
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[12px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Day {dayOffset}
                          </p>
                          <p className="text-[14px] font-semibold text-[var(--color-ink)]">{stepLabel}</p>
                          <Badge tone={STEP_STATUS_TONES[step.status]} size="sm">
                            {step.status}
                          </Badge>
                        </div>
                        <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
                          {formatStepDelayLabel(step.order, step.delayDays, step.sendTime)}
                        </p>
                        {(missingSubject || missingBody) && step.status === "draft" ? (
                          <p className="text-[12px] text-[var(--color-danger)] mt-2">
                            {missingSubject ? "Missing subject" : "Missing email content"}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(
                              workspacePath(
                                workspaceSlug,
                                `dripping/${campaignId}/steps/${step.id}/edit`,
                              ),
                            )
                          }
                        >
                          Edit email
                        </Button>
                        {stepsEditable ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actionPending}
                              onClick={() => void handleDuplicate(step.id)}
                            >
                              Duplicate
                            </Button>
                            {step.status !== "paused" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={actionPending}
                                onClick={() => void handlePauseStep(step.id)}
                              >
                                Pause
                              </Button>
                            ) : null}
                            {step.status === "draft" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={actionPending}
                                onClick={() => void handleDeleteStep(step.id)}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
