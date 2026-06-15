"use client";

import { useEffect, useState } from "react";

import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { workspacePath } from "@/lib/workspace-paths";

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
  const closeHref = workspacePath(workspaceSlug, `dripping/${campaignId}`);
  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns/${campaignId}`;
  const formId = "campaign-step-form";

  const [form, setForm] = useState<StepFormState>(emptyStepForm);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit || !stepId) {
      void fetch(`${apiBase}`)
        .then((res) => res.json())
        .then((payload) => {
          const campaign = payload.data?.campaign;
          const steps = payload.data?.steps;
          void fetch(`${apiBase}/steps`)
            .then((r) => r.json())
            .then((stepsPayload) => {
              const stepCount = stepsPayload.data?.steps?.length ?? steps?.length ?? 0;
              setForm({
                ...emptyStepForm,
                order: String(stepCount + 1),
                fromName: campaign?.defaultFromName ?? campaign?.name ?? "",
              });
            });
        });
      return;
    }

    setLoading(true);
    void fetch(`${apiBase}/steps`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error?.message ?? "Failed to load step.");
        }
        const step = (payload.data?.steps ?? []).find(
          (item: { id: string }) => item.id === stepId,
        );
        if (!step) {
          throw new Error("Step not found.");
        }
        setForm({
          order: String(step.order),
          delayDays: String(step.delayDays),
          sendTime: step.sendTime,
          fromName: step.fromName,
          subject: step.subject,
          body: step.body,
        });
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, [apiBase, isEdit, stepId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const body = {
      order: parseInt(form.order, 10),
      delayDays: parseInt(form.delayDays, 10),
      sendTime: form.sendTime,
      fromName: form.fromName.trim(),
      channel: "email" as const,
      subject: form.subject.trim(),
      body: form.body.trim(),
    };

    try {
      const url = isEdit ? `${apiBase}/steps/${stepId}` : `${apiBase}/steps`;
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        setFormError(payload.error?.message ?? "Failed to save step.");
        return;
      }

      window.location.href = closeHref;
    } catch {
      setFormError("Failed to save step.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-6 py-10 space-y-4">
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
        primaryAction={{ label: "Back to campaign", onClick: () => { window.location.href = closeHref; } }}
      />
    );
  }

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit step" : "Add step"}
      description="Configure when this email sends and what it contains."
      closeHref={closeHref}
      footer={
        <FocusedFormActions
          cancelHref={closeHref}
          formId={formId}
          submitLabel="Save step"
          submitting={submitting}
        />
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {formError ? (
          <p className="text-[13px] text-[var(--color-danger)]">{formError}</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="step-order">Order</Label>
            <Input
              id="step-order"
              type="number"
              min={1}
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="step-delay">Delay days</Label>
            <Input
              id="step-delay"
              type="number"
              min={0}
              value={form.delayDays}
              onChange={(e) => setForm((f) => ({ ...f, delayDays: e.target.value }))}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="step-send-time">Sending time</Label>
            <Input
              id="step-send-time"
              type="time"
              value={form.sendTime}
              onChange={(e) => setForm((f) => ({ ...f, sendTime: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="step-from-name">From name</Label>
            <Input
              id="step-from-name"
              value={form.fromName}
              onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
              required
              maxLength={120}
              placeholder="e.g. Grosvenor Vistas"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="step-subject">Subject</Label>
          <Input
            id="step-subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            required
            maxLength={500}
          />
        </div>
        <div>
          <Label htmlFor="step-body">Body</Label>
          <Textarea
            id="step-body"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            required
            rows={8}
            className="min-h-[12rem] resize-y"
          />
        </div>
      </form>
    </FocusedFormLayout>
  );
}
