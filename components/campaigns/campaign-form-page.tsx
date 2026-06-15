"use client";

import { useState } from "react";

import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select } from "@/components/ui/input";
import { workspacePath } from "@/lib/workspace-paths";

type CampaignFormState = {
  name: string;
  audienceType: "leads" | "opportunities";
  frequency: string;
  defaultFromName: string;
};

const emptyForm: CampaignFormState = {
  name: "",
  audienceType: "leads",
  frequency: "manual",
  defaultFromName: "",
};

type CampaignFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  campaignId?: string;
  initialValues?: Partial<CampaignFormState>;
};

export function CampaignFormPage({
  workspaceSlug,
  mode,
  campaignId,
  initialValues,
}: CampaignFormPageProps) {
  const [form, setForm] = useState<CampaignFormState>({
    ...emptyForm,
    ...initialValues,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCreate = mode === "create";
  const closeHref = isCreate
    ? workspacePath(workspaceSlug, "dripping")
    : workspacePath(workspaceSlug, `dripping/${campaignId}`);
  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns`;
  const formId = "campaign-form";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      audienceType: form.audienceType,
      frequency: form.frequency.trim() || undefined,
      defaultFromName: form.defaultFromName.trim() || undefined,
    };

    try {
      const response = await fetch(isCreate ? apiBase : `${apiBase}/${campaignId}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isCreate
            ? payload
            : {
                name: payload.name,
                defaultFromName: payload.defaultFromName || null,
              },
        ),
      });

      const body = await response.json();

      if (!response.ok) {
        setFormError(body.error?.message ?? "Failed to save campaign.");
        return;
      }

      const id = isCreate ? body.data?.campaign?.id : campaignId;
      window.location.href = workspacePath(workspaceSlug, `dripping/${id}`);
    } catch {
      setFormError("Failed to save campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FocusedFormLayout
      title={isCreate ? "New campaign" : "Campaign settings"}
      description={
        isCreate
          ? "Create a draft campaign. Add email steps before enrolling recipients."
          : "Update campaign name and default sender name."
      }
      closeHref={closeHref}
      footer={
        <FocusedFormActions
          cancelHref={closeHref}
          formId={formId}
          submitLabel={isCreate ? "Create campaign" : "Save"}
          submitting={submitting}
          submitDisabled={!form.name.trim()}
        />
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {formError ? (
          <p className="text-[13px] text-[var(--color-danger)]">{formError}</p>
        ) : null}
        <div>
          <Label htmlFor="campaign-name">Name</Label>
          <Input
            id="campaign-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={200}
          />
        </div>
        {isCreate ? (
          <>
            <div>
              <Label htmlFor="campaign-audience">Audience</Label>
              <Select
                id="campaign-audience"
                value={form.audienceType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    audienceType: e.target.value as CampaignFormState["audienceType"],
                  }))
                }
              >
                <option value="leads">Leads</option>
                <option value="opportunities">Opportunities</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="campaign-frequency">Frequency (optional)</Label>
              <Input
                id="campaign-frequency"
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                placeholder="manual"
              />
            </div>
          </>
        ) : null}
        <div>
          <Label htmlFor="campaign-default-from">Default from name (optional)</Label>
          <Input
            id="campaign-default-from"
            value={form.defaultFromName}
            onChange={(e) => setForm((f) => ({ ...f, defaultFromName: e.target.value }))}
            placeholder="e.g. Grosvenor Vistas"
            maxLength={120}
          />
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            Pre-fills new email steps. Each step can override this sender name.
          </p>
        </div>
      </form>
    </FocusedFormLayout>
  );
}
