"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CampaignSendingDomainField,
  type CampaignSendingDomainValue,
} from "@/components/campaigns/campaign-sending-domain-field";
import { ProjectSelector, type ProjectSelectorProject } from "@/components/domain/project-selector";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  applyCampaignVariables,
  buildCampaignEmailHtml,
  CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
  CAMPAIGN_EMAIL_VARIABLES,
  stripHtmlToPlainText,
  validateCampaignHtml,
} from "@/lib/campaign-email";
import { DEFAULT_CAMPAIGN_STEP_SEND_TIME } from "@/lib/campaign-defaults";
import { formatApiErrorMessage } from "@/lib/format-api-error";
import {
  formatWorkspaceTimezoneLabel,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";
import { workspacePath } from "@/lib/workspace-paths";

type NewsletterCampaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  kind: "newsletter";
  senderName: string | null;
  senderEmail: string | null;
  sendingDomainId: string | null;
  defaultFromName: string | null;
  scheduledFor: string | null;
  audienceLockedAt: string | null;
  audienceSummary: {
    queued: number;
    excludedMissingEmail: number;
    excludedUnsubscribed: number;
    excludedSuppressed: number;
    excludedInvalid: number;
    excludedArchived: number;
    unknownConsent: number;
    deduped: number;
  } | null;
};

type NewsletterStep = {
  id: string;
  subject: string;
  previewText: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  contentMode: string;
  status: string;
  fromName: string | null;
};

type AudiencePreview = {
  summary: {
    queued: number;
    excludedMissingEmail: number;
    excludedUnsubscribed: number;
    excludedSuppressed: number;
    excludedInvalid: number;
    excludedArchived: number;
    unknownConsent: number;
    deduped: number;
  };
  flaggedUnknownConsentSample: Array<{
    leadId: string;
    email: string;
    fullName: string;
  }>;
  exclusionCounts: {
    missingEmail: number;
    unsubscribed: number;
    suppressed: number;
    invalid: number;
    archived: number;
    deduped: number;
  };
};

type NewsletterFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  campaignId?: string;
};

const emptySending: CampaignSendingDomainValue = {
  sendingDomainId: "",
  senderEmail: "",
};

export function NewsletterFormPage({
  workspaceSlug,
  mode,
  campaignId,
}: NewsletterFormPageProps) {
  const router = useRouter();
  const { workspace } = useWorkspaceShell();
  const timezone = workspace?.timezone ?? "UTC";
  const isCreate = mode === "create";

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sending, setSending] = useState<CampaignSendingDomainValue>(emptySending);
  const [bodyHtml, setBodyHtml] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<"any" | "all">("any");
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [campaign, setCampaign] = useState<NewsletterCampaign | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview | null>(null);
  const [scheduledForLocal, setScheduledForLocal] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!isCreate);
  const [previewOpen, setPreviewOpen] = useState(false);

  const apiCampaigns = `/api/workspaces/${workspaceSlug}/campaigns`;
  const apiNewsletters = `/api/workspaces/${workspaceSlug}/newsletters`;
  const closeHref = workspacePath(workspaceSlug, "dripping?tab=newsletters");
  const formId = "newsletter-form";

  const htmlWarnings = useMemo(
    () => (bodyHtml.trim() ? validateCampaignHtml(bodyHtml) : []),
    [bodyHtml],
  );

  const unsafeHtml = htmlWarnings.some(
    (warning) => warning.code === "unsafe_tags" || warning.code === "unsafe_javascript",
  );

  const loadReferenceData = useCallback(async () => {
    const apiBase = `/api/workspaces/${workspaceSlug}`;
    const [projectsRes, tagsRes] = await Promise.all([
      fetch(`${apiBase}/projects`),
      fetch(`${apiBase}/tags?entityType=lead`),
    ]);
    const [projectsPayload, tagsPayload] = await Promise.all([
      projectsRes.json(),
      tagsRes.json(),
    ]);
      if (projectsRes.ok) {
      setProjects(projectsPayload.data?.projects ?? []);
    }
    if (tagsRes.ok) {
      setTags(tagsPayload.data?.tags ?? []);
    }
  }, [workspaceSlug]);

  const refreshAudiencePreview = useCallback(
    async (id: string) => {
      const response = await fetch(`${apiNewsletters}/${id}/audience/preview`);
      const payload = await response.json();
      if (response.ok) {
        setAudiencePreview(payload.data?.preview ?? null);
      }
    },
    [apiNewsletters],
  );

  const loadExisting = useCallback(async () => {
    if (!campaignId) {
      return;
    }
    setLoading(true);
    setFormError(null);
    try {
      const [campaignRes, stepsRes, segmentsRes] = await Promise.all([
        fetch(`${apiCampaigns}/${campaignId}`),
        fetch(`${apiCampaigns}/${campaignId}/steps`),
        fetch(`${apiNewsletters}/${campaignId}/audience/segments`),
      ]);
      const [campaignPayload, stepsPayload, segmentsPayload] = await Promise.all([
        campaignRes.json(),
        stepsRes.json(),
        segmentsRes.json(),
      ]);

      if (!campaignRes.ok) {
        setFormError(formatApiErrorMessage(campaignPayload, "Failed to load newsletter."));
        return;
      }

      const nextCampaign = campaignPayload.data?.campaign as NewsletterCampaign;
      setCampaign(nextCampaign);
      setName(nextCampaign.name ?? "");
      setSenderName(nextCampaign.senderName ?? nextCampaign.defaultFromName ?? "");
      setSending({
        sendingDomainId: nextCampaign.sendingDomainId ?? "",
        senderEmail: nextCampaign.senderEmail ?? "",
      });
      if (nextCampaign.scheduledFor) {
        setScheduledForLocal(
          toDatetimeLocalInWorkspaceTimezone(nextCampaign.scheduledFor, timezone),
        );
      }

      const steps = (stepsPayload.data?.steps ?? stepsPayload.data ?? []) as NewsletterStep[];
      const step = steps[0];
      if (step) {
        setStepId(step.id);
        setSubject(step.subject ?? "");
        setPreviewText(step.previewText ?? "");
        setBodyHtml(step.bodyHtml ?? "");
      }

      const segments = segmentsPayload.data?.segments ?? [];
      const segment = segments[0];
      if (segment) {
        setProjectId(segment.projectId);
        setTagIds(segment.tagIds ?? []);
        setTagMatch(segment.tagMatch === "all" ? "all" : "any");
      }

      await refreshAudiencePreview(campaignId);
    } catch {
      setFormError("Failed to load newsletter.");
    } finally {
      setLoading(false);
    }
  }, [apiCampaigns, apiNewsletters, campaignId, refreshAudiencePreview, timezone]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (!isCreate) {
      void loadExisting();
    }
  }, [isCreate, loadExisting]);

  function toggleTag(tagId: string) {
    setTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  async function saveDraft(options?: { stay?: boolean }): Promise<string | null> {
    setFormError(null);
    setSubmitting(true);

    try {
      if (!name.trim()) {
        setFormError("Name is required.");
        return null;
      }
      if (!projectId) {
        setFormError("Select a project audience.");
        return null;
      }
      if (!subject.trim()) {
        setFormError("Subject is required.");
        return null;
      }
      if (!bodyHtml.trim()) {
        setFormError("HTML content is required.");
        return null;
      }
      if (unsafeHtml) {
        setFormError("Resolve unsafe HTML before saving.");
        return null;
      }

      const senderFields = {
        sendingDomainId: sending.sendingDomainId || undefined,
        senderEmail: sending.senderEmail || undefined,
        senderName: senderName.trim() || undefined,
        defaultFromName: senderName.trim() || undefined,
      };

      let id = campaignId ?? campaign?.id ?? null;

      if (!id) {
        const createRes = await fetch(apiCampaigns, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            kind: "newsletter",
            audienceType: "leads",
            projectIds: [projectId],
            ...senderFields,
          }),
        });
        const createPayload = await createRes.json();
        if (!createRes.ok) {
          setFormError(formatApiErrorMessage(createPayload, "Failed to create newsletter."));
          return null;
        }
        id = createPayload.data?.campaign?.id as string;
        setCampaign(createPayload.data?.campaign ?? null);
      } else {
        const updateRes = await fetch(`${apiCampaigns}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            projectIds: [projectId],
            senderName: senderName.trim() || null,
            defaultFromName: senderName.trim() || null,
            sendingDomainId: sending.sendingDomainId || null,
            senderEmail: sending.senderEmail || null,
          }),
        });
        const updatePayload = await updateRes.json();
        if (!updateRes.ok) {
          setFormError(formatApiErrorMessage(updatePayload, "Failed to update newsletter."));
          return null;
        }
        setCampaign(updatePayload.data?.campaign ?? null);
      }

      const bodyText = stripHtmlToPlainText(bodyHtml);
      const stepPayload = {
        order: 1,
        delayDays: 0,
        delayAmount: 0,
        delayUnit: "days",
        sendTime: DEFAULT_CAMPAIGN_STEP_SEND_TIME,
        fromName: senderName.trim() || undefined,
        channel: "email",
        status: "ready",
        contentMode: "html",
        subject: subject.trim(),
        previewText: previewText.trim() || null,
        body: bodyText,
        bodyHtml,
        bodyText,
      };

      if (stepId) {
        const stepRes = await fetch(`${apiCampaigns}/${id}/steps/${stepId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepPayload),
        });
        const stepPayloadRes = await stepRes.json();
        if (!stepRes.ok) {
          setFormError(formatApiErrorMessage(stepPayloadRes, "Failed to save email content."));
          return null;
        }
      } else {
        const stepRes = await fetch(`${apiCampaigns}/${id}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepPayload),
        });
        const stepBody = await stepRes.json();
        if (!stepRes.ok) {
          setFormError(formatApiErrorMessage(stepBody, "Failed to save email content."));
          return null;
        }
        setStepId(stepBody.data?.step?.id ?? null);
      }

      const segmentsRes = await fetch(`${apiNewsletters}/${id}/audience/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: [
            {
              type: "project_tags",
              order: 1,
              projectId,
              tagIds,
              tagMatch,
            },
          ],
        }),
      });
      const segmentsPayload = await segmentsRes.json();
      if (!segmentsRes.ok) {
        setFormError(formatApiErrorMessage(segmentsPayload, "Failed to save audience."));
        return null;
      }

      await refreshAudiencePreview(id);

      if (!options?.stay) {
        router.replace(workspacePath(workspaceSlug, `dripping/newsletters/${id}`));
      }

      return id;
    } catch {
      setFormError("Failed to save newsletter.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendNow() {
    const id = await saveDraft({ stay: true });
    if (!id) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`${apiNewsletters}/${id}/send`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setFormError(formatApiErrorMessage(payload, "Failed to send newsletter."));
        return;
      }
      window.location.href = workspacePath(workspaceSlug, `dripping/${id}/analytics`);
    } catch {
      setFormError("Failed to send newsletter.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledForLocal.trim()) {
      setFormError("Choose a schedule date and time.");
      return;
    }
    const id = await saveDraft({ stay: true });
    if (!id) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`${apiNewsletters}/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledForLocal }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFormError(formatApiErrorMessage(payload, "Failed to schedule newsletter."));
        return;
      }
      setCampaign(payload.data?.campaign ?? null);
      await refreshAudiencePreview(id);
    } catch {
      setFormError("Failed to schedule newsletter.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelSchedule() {
    const id = campaignId ?? campaign?.id;
    if (!id) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`${apiNewsletters}/${id}/cancel-schedule`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setFormError(formatApiErrorMessage(payload, "Failed to cancel schedule."));
        return;
      }
      setCampaign(payload.data?.campaign ?? null);
      setScheduledForLocal("");
      await refreshAudiencePreview(id);
    } catch {
      setFormError("Failed to cancel schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleHtmlFile(file: File | null) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBodyHtml(reader.result);
      }
    };
    reader.readAsText(file);
  }

  const previewHtml = useMemo(() => {
    if (!bodyHtml.trim()) {
      return "";
    }
    const htmlBody = applyCampaignVariables(bodyHtml, CAMPAIGN_EMAIL_PREVIEW_CONTEXT);
    return buildCampaignEmailHtml("", CAMPAIGN_EMAIL_PREVIEW_CONTEXT.unsubscribeUrl ?? "#", {
      htmlBody,
      previewText: previewText || null,
    });
  }, [bodyHtml, previewText]);

  if (loading) {
    return (
      <FocusedFormLayout title="Newsletter" closeHref={closeHref}>
        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading newsletter…</p>
      </FocusedFormLayout>
    );
  }

  return (
    <FocusedFormLayout
      title={isCreate ? "New newsletter" : "Edit newsletter"}
      description="One email, audience snapshot, send or schedule. Uses drip sending infrastructure."
      closeHref={closeHref}
      footer={
        <FocusedFormActions
          cancelHref={closeHref}
          formId={formId}
          submitLabel="Save draft"
          submitting={submitting}
          submitDisabled={!name.trim()}
        />
      }
    >
      <form
        id={formId}
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDraft({ stay: !isCreate });
        }}
      >
        {formError ? (
          <p className="text-[13px] text-[var(--color-danger)]">{formError}</p>
        ) : null}

        {campaign?.audienceLockedAt && campaign.status === "active" ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px]">
            Scheduled for{" "}
            {campaign.scheduledFor
              ? toDatetimeLocalInWorkspaceTimezone(campaign.scheduledFor, timezone)
              : "immediate send"}
            . You can edit or cancel until sending starts.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleCancelSchedule()}>
                Cancel schedule
              </Button>
              <Link
                href={workspacePath(workspaceSlug, `dripping/${campaign.id}/analytics`)}
                className="text-[12px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                View analytics
              </Link>
            </div>
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Content</h2>
            <Badge tone="muted" size="sm">
              HTML
            </Badge>
          </div>
          <div>
            <Label htmlFor="newsletter-name">Name</Label>
            <Input
              id="newsletter-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-subject">Subject</Label>
            <Input
              id="newsletter-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-preview">Preview text</Label>
            <Input
              id="newsletter-preview"
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-sender-name">Sender name</Label>
            <Input
              id="newsletter-sender-name"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              placeholder="What recipients see in their inbox"
              maxLength={120}
            />
          </div>
          <CampaignSendingDomainField
            workspaceSlug={workspaceSlug}
            value={sending}
            onChange={setSending}
          />
          <div>
            <Label htmlFor="newsletter-html-file">Upload HTML</Label>
            <Input
              id="newsletter-html-file"
              type="file"
              accept=".html,text/html"
              onChange={(event) => handleHtmlFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label htmlFor="newsletter-html">HTML content</Label>
              <button
                type="button"
                className="text-[12px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                onClick={() => setPreviewOpen((open) => !open)}
              >
                {previewOpen ? "Hide preview" : "Show preview"}
              </button>
            </div>
            <Textarea
              id="newsletter-html"
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
              rows={14}
              className="font-mono text-[12px]"
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Merge fields:{" "}
              {CAMPAIGN_EMAIL_VARIABLES.map((variable) => variable.token).join(", ")}
            </p>
            {htmlWarnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-danger)]">
                {htmlWarnings.map((warning) => (
                  <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {previewOpen && previewHtml ? (
            <iframe
              title="Newsletter preview"
              className="h-[420px] w-full rounded-lg border border-[var(--color-line)] bg-white"
              srcDoc={previewHtml}
            />
          ) : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Audience</h2>
          <div>
            <Label>Project</Label>
            <ProjectSelector
              projects={projects}
              selectedProjectId={projectId}
              onChange={setProjectId}
              searchable
            />
          </div>
          <div>
            <Label>Lead tags (optional)</Label>
            <TagSelector
              tags={tags}
              selectedTagIds={tagIds}
              entityType="lead"
              onToggle={toggleTag}
              emptyLabel="No lead tags yet"
            />
          </div>
          {tagIds.length > 0 ? (
            <div>
              <Label htmlFor="newsletter-tag-match">Tag match</Label>
              <Select
                id="newsletter-tag-match"
                value={tagMatch}
                onChange={(event) => setTagMatch(event.target.value as "any" | "all")}
              >
                <option value="any">Match any selected tag</option>
                <option value="all">Match all selected tags</option>
              </Select>
            </div>
          ) : null}

          {audiencePreview ? (
            <div className="rounded-lg border border-[var(--color-line)] px-3 py-3 text-[13px]">
              <p className="font-semibold text-[var(--color-ink)]">
                {audiencePreview.summary.queued.toLocaleString()} recipients included
              </p>
              <p className="mt-1 text-[var(--color-ink-muted)]">
                Exclusions — missing email: {audiencePreview.exclusionCounts.missingEmail},
                unsubscribed: {audiencePreview.exclusionCounts.unsubscribed}, suppressed:{" "}
                {audiencePreview.exclusionCounts.suppressed}, invalid:{" "}
                {audiencePreview.exclusionCounts.invalid}, archived:{" "}
                {audiencePreview.exclusionCounts.archived}, deduped:{" "}
                {audiencePreview.exclusionCounts.deduped}
              </p>
              {audiencePreview.summary.unknownConsent > 0 ? (
                <p className="mt-2 rounded-md bg-[var(--color-warn-soft,rgba(180,120,20,0.12))] px-2 py-1.5 text-[12.5px] text-[var(--color-ink)]">
                  {audiencePreview.summary.unknownConsent.toLocaleString()} contacts have
                  unknown email consent and will be included. Review carefully before send.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Save the draft to refresh live recipient counts.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Review & send</h2>
          <div className="rounded-lg border border-[var(--color-line)] px-3 py-3 text-[13px] text-[var(--color-ink-soft)]">
            <p>
              <span className="font-medium text-[var(--color-ink)]">From:</span>{" "}
              {senderName || "—"} &lt;{sending.senderEmail || "—"}&gt;
            </p>
            <p className="mt-1">
              <span className="font-medium text-[var(--color-ink)]">Subject:</span>{" "}
              {subject || "—"}
            </p>
            <p className="mt-1">
              <span className="font-medium text-[var(--color-ink)]">Recipients:</span>{" "}
              {audiencePreview?.summary.queued?.toLocaleString() ?? "Save to preview"}
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Workspace timezone: {formatWorkspaceTimezoneLabel(timezone)}
            </p>
          </div>
          <div>
            <Label htmlFor="newsletter-schedule">Schedule (optional)</Label>
            <Input
              id="newsletter-schedule"
              type="datetime-local"
              value={scheduledForLocal}
              onChange={(event) => setScheduledForLocal(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void handleSendNow()}
            >
              Send now
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting || !scheduledForLocal}
              onClick={() => void handleSchedule()}
            >
              Schedule send
            </Button>
          </div>
        </section>
      </form>
    </FocusedFormLayout>
  );
}
