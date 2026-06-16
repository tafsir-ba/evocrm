"use client";

import { useEffect, useMemo, useState } from "react";

import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CAMPAIGN_EMAIL_VARIABLES,
  emailBodyHasUnsubscribe,
  normalizeCampaignSendTime,
  validateCampaignHtml,
} from "@/lib/campaign-email";
import { formatWorkspaceTimezoneLabel } from "@/lib/workspace-datetime";
import { workspacePath } from "@/lib/workspace-paths";

type ContentMode = "plain_text" | "rich_text" | "html";

type StepFormState = {
  name: string;
  order: string;
  delayDays: string;
  sendTime: string;
  subject: string;
  previewText: string;
  contentMode: ContentMode;
  body: string;
  bodyHtml: string;
  bodyText: string;
  status: "draft" | "ready" | "active" | "paused";
};

type SaveIntent = "preserve" | "draft" | "ready";

const emptyStepForm: StepFormState = {
  name: "",
  order: "1",
  delayDays: "0",
  sendTime: "09:00",
  subject: "",
  previewText: "",
  contentMode: "plain_text",
  body: "",
  bodyHtml: "",
  bodyText: "",
  status: "draft",
};

type CampaignStepFormPageProps = {
  workspaceSlug: string;
  campaignId: string;
  stepId?: string;
};

export function CampaignStepFormPage({
  workspaceSlug,
  campaignId,
  stepId,
}: CampaignStepFormPageProps) {
  const isEdit = Boolean(stepId);
  const { workspace } = useWorkspaceShell();
  const closeHref = workspacePath(workspaceSlug, `dripping/${campaignId}`);
  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}`;
  const formId = "campaign-step-form";

  const [campaignName, setCampaignName] = useState("");
  const [stepPosition, setStepPosition] = useState({ current: 1, total: 1 });
  const [form, setForm] = useState<StepFormState>(emptyStepForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const stepsRes = await fetch(`${apiBase}/steps`);
        const stepsPayload = await stepsRes.json();
        const campaignRes = await fetch(apiBase);
        const campaignPayload = await campaignRes.json();

        if (!campaignRes.ok) {
          throw new Error(campaignPayload.error?.message ?? "Failed to load campaign.");
        }

        if (!stepsRes.ok) {
          throw new Error(stepsPayload.error?.message ?? "Failed to load campaign steps.");
        }

        if (!active) {
          return;
        }

        const campaign = campaignPayload.data?.campaign;
        const steps = stepsPayload.data?.steps ?? [];
        setCampaignName(campaign?.name ?? "Campaign");

        if (isEdit && stepId) {
          const step = steps.find((item: { id: string }) => item.id === stepId);
          if (!step) {
            throw new Error("Step not found.");
          }

          setStepPosition({
            current: step.order,
            total: steps.length,
          });
          setForm({
            name: step.name ?? step.subject ?? "",
            order: String(step.order),
            delayDays: String(step.delayDays),
            sendTime: step.sendTime,
            subject: step.subject ?? "",
            previewText: step.previewText ?? "",
            contentMode: step.contentMode ?? "plain_text",
            body: step.body ?? "",
            bodyHtml: step.bodyHtml ?? "",
            bodyText: step.bodyText ?? "",
            status: step.status ?? "draft",
          });
          return;
        }

        setStepPosition({ current: steps.length + 1, total: steps.length + 1 });
        setForm({
          ...emptyStepForm,
          order: String(steps.length + 1),
          name: `Email ${steps.length + 1}`,
        });
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load form.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [apiBase, isEdit, stepId]);

  const htmlWarnings = useMemo(() => {
    if (form.contentMode !== "html") {
      return [];
    }
    return validateCampaignHtml(form.bodyHtml);
  }, [form.bodyHtml, form.contentMode]);

  function buildPayload(intent: SaveIntent) {
    const contentMode = form.contentMode;
    const body =
      contentMode === "html"
        ? form.bodyText || form.body
        : contentMode === "rich_text"
          ? form.body
          : form.body;
    const bodyHtml =
      contentMode === "html" || contentMode === "rich_text" ? form.bodyHtml || null : null;
    const bodyText = form.bodyText || form.body;

    const trimmedName = form.name.trim();
    const normalizedSendTime = normalizeCampaignSendTime(form.sendTime);

    const payload = {
      order: parseInt(form.order, 10),
      ...(trimmedName
        ? { name: trimmedName }
        : isEdit
          ? { name: null }
          : {}),
      delayDays: parseInt(form.delayDays, 10),
      sendTime: normalizedSendTime,
      contentMode,
      subject: form.subject.trim(),
      previewText: form.previewText.trim() || null,
      body: body.trim(),
      bodyHtml,
      bodyText: bodyText.trim() || null,
    };

    if (!isEdit) {
      return {
        ...payload,
        status: intent === "ready" ? "ready" : "draft",
        channel: "email" as const,
      };
    }

    if (intent === "preserve") {
      return payload;
    }

    return { ...payload, status: intent };
  }

  function formatSaveError(payload: { error?: { message?: string; details?: Record<string, string[]> } }) {
    const details = payload.error?.details;
    if (details) {
      const detailMessages = Object.entries(details).flatMap(([field, messages]) =>
        messages.map((message) => (field === "_root" ? message : `${field}: ${message}`)),
      );
      if (detailMessages.length > 0) {
        return detailMessages.join(" ");
      }
    }

    return payload.error?.message ?? "Failed to save step.";
  }

  async function saveStep(intent: SaveIntent) {
    setFormError(null);
    setFormMessage(null);

    const bodyContent = `${form.body} ${form.bodyHtml} ${form.bodyText}`;
    if (intent === "ready" && !emailBodyHasUnsubscribe(bodyContent)) {
      setFormError(
        "Include {unsubscribe_url} in the email body before marking this email as ready.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const url = isEdit ? `${apiBase}/steps/${stepId}` : `${apiBase}/steps`;
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(intent)),
      });
      const payload = await response.json();

      if (!response.ok) {
        setFormError(formatSaveError(payload));
        return;
      }

      if (!isEdit) {
        window.location.href = workspacePath(
          workspaceSlug,
          `dripping/${campaignId}/steps/${payload.data.step.id}/edit`,
        );
        return;
      }

      if (intent !== "preserve") {
        setForm((current) => ({ ...current, status: intent }));
      } else {
        const savedSendTime = payload.data?.step?.sendTime;
        if (typeof savedSendTime === "string") {
          setForm((current) => ({ ...current, sendTime: savedSendTime }));
        }
      }

      setFormMessage(
        intent === "ready"
          ? "Email marked as ready."
          : intent === "preserve"
            ? "Changes saved."
            : "Draft saved.",
      );
    } catch {
      setFormError("Failed to save step.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestEmail() {
    if (!isEdit || !stepId || !testEmail.trim()) {
      return;
    }

    setSubmitting(true);
    setFormMessage(null);
    setFormError(null);

    try {
      const response = await fetch(`${apiBase}/steps/${stepId}/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setFormError(payload.error?.message ?? "Failed to send test email.");
        return;
      }

      setFormMessage("Test email sent.");
    } catch {
      setFormError("Failed to send test email.");
    } finally {
      setSubmitting(false);
    }
  }

  function insertVariable(token: string, field: "body" | "bodyHtml") {
    setForm((current) => ({
      ...current,
      [field]: `${current[field]}${token}`,
    }));
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load step"
        description={loadError}
        primaryAction={{
          label: "Back to campaign",
          onClick: () => {
            window.location.href = closeHref;
          },
        }}
      />
    );
  }

  const activeBodyField = form.contentMode === "html" ? "bodyHtml" : "body";
  const bodyContent = `${form.body} ${form.bodyHtml} ${form.bodyText}`;
  const missingUnsubscribe = !emailBodyHasUnsubscribe(bodyContent);

  return (
    <FocusedFormLayout
      title={isEdit ? form.name || "Edit email" : "Add email step"}
      description={`Campaign: ${campaignName} · Step ${stepPosition.current} of ${stepPosition.total}`}
      closeHref={closeHref}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2">
            <Badge tone={form.status === "ready" ? "success" : "muted"} size="sm">
              {form.status}
            </Badge>
            {formMessage ? (
              <span className="text-[12.5px] text-[var(--color-ink-muted)]">{formMessage}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {isEdit ? (
              <Button disabled={submitting} onClick={() => void saveStep("preserve")}>
                Save
              </Button>
            ) : null}
            <Button variant="secondary" disabled={submitting} onClick={() => void saveStep("draft")}>
              Save draft
            </Button>
            <Button
              disabled={submitting || missingUnsubscribe}
              onClick={() => void saveStep("ready")}
            >
              Mark as ready
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void saveStep(isEdit ? "preserve" : "draft");
        }}
        className="space-y-6"
      >
        {formError ? <p className="text-[13px] text-[var(--color-danger)]">{formError}</p> : null}

        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="step-name">Email name</Label>
              <Input
                id="step-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="step-delay">Delay after previous email (days)</Label>
              <Input
                id="step-delay"
                type="number"
                min={0}
                value={form.delayDays}
                onChange={(e) => setForm((f) => ({ ...f, delayDays: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="step-send-time">Send time</Label>
              <Input
                id="step-send-time"
                type="time"
                value={form.sendTime}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sendTime: normalizeCampaignSendTime(e.target.value),
                  }))
                }
              />
              <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                Uses workspace timezone: {formatWorkspaceTimezoneLabel(workspace.timezone)}.
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <Label htmlFor="step-subject">Subject</Label>
            <Input
              id="step-subject"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="step-preview-text">Preview text</Label>
            <Input
              id="step-preview-text"
              value={form.previewText}
              onChange={(e) => setForm((f) => ({ ...f, previewText: e.target.value }))}
              maxLength={500}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["plain_text", "rich_text", "html"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={form.contentMode === mode ? "primary" : "secondary"}
                onClick={() => setForm((f) => ({ ...f, contentMode: mode }))}
              >
                {mode === "plain_text"
                  ? "Plain text"
                  : mode === "rich_text"
                    ? "Rich text"
                    : "HTML"}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_EMAIL_VARIABLES.map((variable) => (
              <Button
                key={variable.key}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => insertVariable(variable.token, activeBodyField)}
              >
                {variable.label}
              </Button>
            ))}
          </div>

          {form.contentMode === "html" ? (
            <div>
              <Label htmlFor="step-body-html">HTML body</Label>
              <Textarea
                id="step-body-html"
                value={form.bodyHtml}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bodyHtml: e.target.value,
                    bodyText: e.target.value.replace(/<[^>]+>/g, " "),
                  }))
                }
                rows={12}
                className="min-h-[16rem] font-mono text-[12.5px]"
              />
              {htmlWarnings.map((warning) => (
                <p key={warning.code} className="text-[12px] text-[var(--color-warning)] mt-2">
                  {warning.message}
                </p>
              ))}
            </div>
          ) : form.contentMode === "rich_text" ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="step-body-rich">Rich text body</Label>
                <Textarea
                  id="step-body-rich"
                  value={form.body}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      body: e.target.value,
                      bodyHtml: e.target.value.replace(/\n/g, "<br />"),
                      bodyText: e.target.value,
                    }))
                  }
                  rows={10}
                  className="min-h-[14rem]"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="step-body">Plain text body</Label>
              <Textarea
                id="step-body"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    body: e.target.value,
                    bodyText: e.target.value,
                  }))
                }
                rows={10}
                className="min-h-[14rem]"
              />
            </div>
          )}

          {missingUnsubscribe ? (
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              Include {"{unsubscribe_url}"} before marking this email as ready. Use{" "}
              <strong>Save</strong> to update send time or content without changing status.
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3">Rendered preview</h3>
          <div
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4 text-[13px] leading-relaxed"
            dangerouslySetInnerHTML={{
              __html:
                form.contentMode === "html"
                  ? form.bodyHtml || "<p>No content yet.</p>"
                  : (form.bodyHtml || form.body).replace(/\n/g, "<br />") || "No content yet.",
            }}
          />
        </Card>

        {isEdit ? (
          <Card>
            <h3 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3">Test email</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={submitting || !testEmail.trim()}
                onClick={() => void handleTestEmail()}
              >
                Send test email
              </Button>
            </div>
          </Card>
        ) : null}
      </form>
    </FocusedFormLayout>
  );
}
