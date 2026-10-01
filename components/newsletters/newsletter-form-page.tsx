"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CampaignSendingDomainField,
  type CampaignSendingDomainValue,
} from "@/components/campaigns/campaign-sending-domain-field";
import { ProjectSelector, type ProjectSelectorProject } from "@/components/domain/project-selector";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import { ImportWizard } from "@/components/imports/import-wizard";
import { FocusedFormLayout } from "@/components/layout/focused-form-layout";
import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
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
  importSummaries?: Array<{
    segmentId: string;
    importJobId: string;
    status: string;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    resolvedLeadCount: number;
  }>;
};

type ProjectTagsSegmentDraft = {
  key: string;
  type: "project_tags";
  projectId: string | null;
  tagIds: string[];
  tagMatch: "any" | "all";
};

type CsvImportSegmentDraft = {
  key: string;
  type: "csv_import";
  projectId: string | null;
  importJobId: string | null;
  applyTagId: string | null;
  fileName: string | null;
};

type AudienceSegmentDraft = ProjectTagsSegmentDraft | CsvImportSegmentDraft;

function createProjectTagsSegment(): ProjectTagsSegmentDraft {
  return {
    key: `seg-${Math.random().toString(36).slice(2, 10)}`,
    type: "project_tags",
    projectId: null,
    tagIds: [],
    tagMatch: "any",
  };
}

function createCsvImportSegment(): CsvImportSegmentDraft {
  return {
    key: `seg-${Math.random().toString(36).slice(2, 10)}`,
    type: "csv_import",
    projectId: null,
    importJobId: null,
    applyTagId: null,
    fileName: null,
  };
}

type NewsletterFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  campaignId?: string;
  canUpdate?: boolean;
};

const emptySending: CampaignSendingDomainValue = {
  sendingDomainId: "",
  senderEmail: "",
};

export function NewsletterFormPage({
  workspaceSlug,
  mode,
  campaignId,
  canUpdate = false,
}: NewsletterFormPageProps) {
  const router = useRouter();
  const { workspace } = useWorkspaceShell();
  const timezone = workspace?.timezone ?? "UTC";
  const isCreate = mode === "create";
  const readOnly = !canUpdate && !isCreate;

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sending, setSending] = useState<CampaignSendingDomainValue>(emptySending);
  const [bodyHtml, setBodyHtml] = useState("");
  const [segments, setSegments] = useState<AudienceSegmentDraft[]>([
    createProjectTagsSegment(),
  ]);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportSegmentKey, setCsvImportSegmentKey] = useState<string | null>(null);
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
  const [wizardStep, setWizardStep] = useState<"content" | "audience" | "review">(
    "content",
  );
  const submittingRef = useRef(false);
  const createdIdRef = useRef<string | null>(campaignId ?? null);
  const htmlEditorRef = useRef<HTMLTextAreaElement | null>(null);

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

      const nextCampaign = campaignPayload.data?.campaign as NewsletterCampaign & {
        kind?: string;
      };
      if (!nextCampaign || nextCampaign.kind !== "newsletter") {
        setFormError("This campaign is not a newsletter.");
        if (nextCampaign?.id) {
          router.replace(workspacePath(workspaceSlug, `dripping/${nextCampaign.id}`));
        }
        return;
      }
      createdIdRef.current = nextCampaign.id;
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

      const loadedSegments = (segmentsPayload.data?.segments ?? []) as Array<{
        id: string;
        type?: string;
        projectId: string;
        tagIds?: string[];
        tagMatch?: string;
        importJobId?: string | null;
        applyTagId?: string | null;
      }>;

      if (loadedSegments.length > 0) {
        setSegments(
          loadedSegments.map((segment) => {
            if (segment.type === "csv_import") {
              return {
                key: segment.id,
                type: "csv_import" as const,
                projectId: segment.projectId,
                importJobId: segment.importJobId ?? null,
                applyTagId: segment.applyTagId ?? null,
                fileName: null,
              };
            }

            return {
              key: segment.id,
              type: "project_tags" as const,
              projectId: segment.projectId,
              tagIds: segment.tagIds ?? [],
              tagMatch: segment.tagMatch === "all" ? ("all" as const) : ("any" as const),
            };
          }),
        );
      }

      await refreshAudiencePreview(campaignId);
    } catch {
      setFormError("Failed to load newsletter.");
    } finally {
      setLoading(false);
    }
  }, [
    apiCampaigns,
    apiNewsletters,
    campaignId,
    refreshAudiencePreview,
    router,
    timezone,
    workspaceSlug,
  ]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (!isCreate) {
      void loadExisting();
    }
  }, [isCreate, loadExisting]);

  function updateSegment(
    key: string,
    updater: (segment: AudienceSegmentDraft) => AudienceSegmentDraft,
  ) {
    setSegments((current) =>
      current.map((segment) => (segment.key === key ? updater(segment) : segment)),
    );
  }

  function removeSegment(key: string) {
    setSegments((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((segment) => segment.key !== key);
    });
  }

  function toggleSegmentTag(key: string, tagId: string) {
    updateSegment(key, (segment) => {
      if (segment.type !== "project_tags") {
        return segment;
      }
      return {
        ...segment,
        tagIds: segment.tagIds.includes(tagId)
          ? segment.tagIds.filter((id) => id !== tagId)
          : [...segment.tagIds, tagId],
      };
    });
  }

  async function openCsvImport(segmentKey: string) {
    const segment = segments.find(
      (row): row is CsvImportSegmentDraft =>
        row.key === segmentKey && row.type === "csv_import",
    );
    if (!segment?.projectId) {
      setFormError("Select a target project before uploading a CSV.");
      return;
    }

    // Newsletter import API requires an existing campaign id.
    let id = campaignId ?? campaign?.id ?? createdIdRef.current;
    if (!id) {
      id = await saveDraft({ stay: true, allowIncompleteCsv: true });
      if (!id) {
        return;
      }
    }

    setCsvImportSegmentKey(segmentKey);
    setCsvImportOpen(true);
  }

  const newsletterIdForImport =
    campaignId ?? campaign?.id ?? createdIdRef.current ?? null;

  const activeCsvSegment =
    csvImportSegmentKey == null
      ? null
      : segments.find(
          (segment): segment is CsvImportSegmentDraft =>
            segment.key === csvImportSegmentKey && segment.type === "csv_import",
        );

  async function saveDraft(options?: {
    stay?: boolean;
    keepSubmitting?: boolean;
    allowIncompleteCsv?: boolean;
  }): Promise<string | null> {
    if (readOnly) {
      setFormError("You do not have permission to edit newsletters.");
      return null;
    }
    if (submittingRef.current) {
      return null;
    }
    submittingRef.current = true;
    setFormError(null);
    setSubmitting(true);

    try {
      if (!name.trim()) {
        setFormError("Name is required.");
        return null;
      }

      const savableSegments = options?.allowIncompleteCsv
        ? segments.filter(
            (segment) =>
              segment.type === "project_tags" ||
              (segment.type === "csv_import" && Boolean(segment.importJobId)),
          )
        : segments;

      const projectIds = [
        ...new Set(
          segments
            .map((segment) => segment.projectId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      if (projectIds.length === 0) {
        setFormError("Add at least one audience segment with a project.");
        return null;
      }

      if (!options?.allowIncompleteCsv) {
        for (const [index, segment] of segments.entries()) {
          if (!segment.projectId) {
            setFormError(`Segment ${index + 1} needs a target project.`);
            return null;
          }
          if (segment.type === "csv_import" && !segment.importJobId) {
            setFormError(
              `CSV segment ${index + 1} still needs an import. Upload and finish the CSV first.`,
            );
            return null;
          }
        }
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

      let id = campaignId ?? campaign?.id ?? createdIdRef.current ?? null;

      if (!id) {
        const createRes = await fetch(apiCampaigns, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            kind: "newsletter",
            audienceType: "leads",
            projectIds,
            ...senderFields,
          }),
        });
        const createPayload = await createRes.json();
        if (!createRes.ok) {
          setFormError(formatApiErrorMessage(createPayload, "Failed to create newsletter."));
          return null;
        }
        id = createPayload.data?.campaign?.id as string;
        createdIdRef.current = id;
        setCampaign(createPayload.data?.campaign ?? null);
      } else {
        const updateRes = await fetch(`${apiCampaigns}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
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

      const segmentsForApi = savableSegments;

      // CSV bootstrap (allowIncompleteCsv) may create the campaign before any
      // import finishes. Never invent a project_tags stub — that would briefly
      // target the entire project membership.
      if (segmentsForApi.length === 0) {
        if (options?.allowIncompleteCsv) {
          if (!options?.stay) {
            router.replace(workspacePath(workspaceSlug, `dripping/newsletters/${id}`));
          }
          return id;
        }
        setFormError("Add at least one audience segment with a project.");
        return null;
      }

      const segmentsPayloadBody = {
        segments: segmentsForApi.map((segment, index) => {
          if (segment.type === "csv_import") {
            return {
              type: "csv_import" as const,
              order: index + 1,
              projectId: segment.projectId!,
              importJobId: segment.importJobId!,
              applyTagId: segment.applyTagId,
            };
          }

          return {
            type: "project_tags" as const,
            order: index + 1,
            projectId: segment.projectId!,
            tagIds: segment.tagIds,
            tagMatch: segment.tagMatch,
          };
        }),
      };

      const segmentsRes = await fetch(`${apiNewsletters}/${id}/audience/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(segmentsPayloadBody),
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
      if (!options?.keepSubmitting) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  async function handleSendNow() {
    if (!canUpdate || submittingRef.current) {
      return;
    }
    const id = await saveDraft({ stay: true, keepSubmitting: true });
    if (!id) {
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSchedule() {
    if (!canUpdate || submittingRef.current) {
      return;
    }
    if (!scheduledForLocal.trim()) {
      setFormError("Choose a schedule date and time.");
      return;
    }
    const id = await saveDraft({ stay: true, keepSubmitting: true });
    if (!id) {
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCancelSchedule() {
    if (!canUpdate || submittingRef.current) {
      return;
    }
    const id = campaignId ?? campaign?.id ?? createdIdRef.current;
    if (!id) {
      return;
    }
    submittingRef.current = true;
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleHtmlFile(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html") {
      setFormError("Please upload an .html file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBodyHtml(reader.result);
        setPreviewOpen(true);
        setFormError(null);
      }
    };
    reader.onerror = () => {
      setFormError("Could not read that HTML file. Try pasting the HTML instead.");
    };
    reader.readAsText(file);
  }

  function insertMergeField(token: string) {
    if (readOnly) {
      return;
    }
    const el = htmlEditorRef.current;
    if (!el) {
      setBodyHtml((current) => `${current}${token}`);
      return;
    }
    const start = el.selectionStart ?? bodyHtml.length;
    const end = el.selectionEnd ?? start;
    const next = `${bodyHtml.slice(0, start)}${token}${bodyHtml.slice(end)}`;
    setBodyHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
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

  const contentReady =
    Boolean(name.trim()) &&
    Boolean(subject.trim()) &&
    Boolean(bodyHtml.trim()) &&
    !unsafeHtml;
  const audienceReady = segments.every(
    (segment) =>
      Boolean(segment.projectId) &&
      (segment.type === "project_tags" || Boolean(segment.importJobId)),
  );

  const steps = [
    { id: "content" as const, label: "1. Content", hint: "Subject & HTML" },
    { id: "audience" as const, label: "2. Audience", hint: "Who receives it" },
    { id: "review" as const, label: "3. Review", hint: "Send or schedule" },
  ];

  if (loading) {
    return (
      <FocusedFormLayout title="Newsletter" closeHref={closeHref} maxWidth="3xl">
        <div className="space-y-3 py-6 text-center">
          <p className="text-[14px] font-medium text-[var(--color-ink)]">
            Loading your newsletter…
          </p>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Pulling content, audience, and send settings.
          </p>
        </div>
      </FocusedFormLayout>
    );
  }

  return (
    <FocusedFormLayout
      title={isCreate ? "New newsletter" : name.trim() || "Edit newsletter"}
      description="Write one email, choose who should get it, then send now or schedule. We’ll snapshot the list so later tag changes don’t change who was included."
      closeHref={closeHref}
      maxWidth="3xl"
      footer={
        readOnly ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-[var(--color-line)] pt-4">
            <Link
              href={closeHref}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
            >
              Close
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
            <div className="flex flex-wrap gap-2">
              {wizardStep !== "content" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() =>
                    setWizardStep((current) =>
                      current === "review" ? "audience" : "content",
                    )
                  }
                >
                  Back
                </Button>
              ) : (
                <Link
                  href={closeHref}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
                >
                  Cancel
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                form={formId}
                variant="secondary"
                disabled={submitting || !name.trim()}
              >
                {submitting ? "Saving…" : "Save draft"}
              </Button>
              {wizardStep === "content" ? (
                <Button
                  type="button"
                  disabled={!contentReady || submitting}
                  onClick={() => {
                    if (!contentReady) {
                      setFormError(
                        unsafeHtml
                          ? "Fix the HTML warnings below before continuing."
                          : "Add a name, subject, and HTML content to continue.",
                      );
                      return;
                    }
                    setFormError(null);
                    setWizardStep("audience");
                  }}
                >
                  Next: Audience
                </Button>
              ) : null}
              {wizardStep === "audience" ? (
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (!audienceReady) {
                      setFormError(
                        "Each audience segment needs a project. Finish any CSV import before continuing.",
                      );
                      return;
                    }
                    setFormError(null);
                    setWizardStep("review");
                    setPreviewOpen(true);
                  }}
                >
                  Next: Review
                </Button>
              ) : null}
            </div>
          </div>
        )
      }
    >
      <form
        id={formId}
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDraft({ stay: !isCreate });
        }}
      >
        <nav aria-label="Newsletter steps" className="flex flex-wrap gap-2">
          {steps.map((step) => {
            const active = wizardStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                className={
                  active
                    ? "rounded-md border border-[var(--color-ink)] bg-[var(--color-canvas)] px-3 py-2 text-left"
                    : "rounded-md border border-[var(--color-line)] px-3 py-2 text-left text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                }
                onClick={() => setWizardStep(step.id)}
              >
                <span className="block text-[13px] font-semibold text-[var(--color-ink)]">
                  {step.label}
                </span>
                <span className="block text-[12px]">{step.hint}</span>
              </button>
            );
          })}
        </nav>

        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft,rgba(180,40,40,0.08))] px-3 py-2 text-[13px] text-[var(--color-danger)]"
          >
            {formError}
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Fix the issue above, then try again. Your draft is not lost.
            </p>
          </div>
        ) : null}

        {readOnly ? (
          <p className="rounded-md border border-[var(--color-line)] px-3 py-2 text-[13px] text-[var(--color-ink-muted)]">
            You’re viewing this newsletter. Ask for campaign update permission to edit or send.
          </p>
        ) : null}

        {campaign?.audienceLockedAt && campaign.status === "active" ? (
          <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-[13px]">
            <p className="font-medium text-[var(--color-ink)]">
              {campaign.scheduledFor
                ? `Scheduled for ${toDatetimeLocalInWorkspaceTimezone(campaign.scheduledFor, timezone)} (${formatWorkspaceTimezoneLabel(timezone)})`
                : "Sending has been queued"}
            </p>
            <p className="mt-1 text-[var(--color-ink-muted)]">
              You can still edit or cancel until the first email starts sending.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {canUpdate ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void handleCancelSchedule()}
                >
                  Cancel schedule
                </Button>
              ) : null}
              <Link
                href={workspacePath(workspaceSlug, `dripping/${campaign.id}/analytics`)}
                className="inline-flex h-8 items-center text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                View results
              </Link>
            </div>
          </div>
        ) : null}

        {wizardStep === "content" ? (
        <section className="space-y-4" aria-labelledby="newsletter-step-content">
          <div>
            <h2 id="newsletter-step-content" className="text-[15px] font-semibold text-[var(--color-ink)]">
              Content
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
              Tell recipients who the email is from, what it’s about, and paste or upload your HTML.
            </p>
          </div>
          <div>
            <Label htmlFor="newsletter-name">Internal name</Label>
            <Input
              id="newsletter-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
              disabled={readOnly}
              placeholder="e.g. Spring update — March"
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Only your team sees this name in the Newsletters list.
            </p>
          </div>
          <div>
            <Label htmlFor="newsletter-subject">Email subject</Label>
            <Input
              id="newsletter-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={500}
              disabled={readOnly}
              placeholder="What people see in their inbox"
            />
          </div>
          <div>
            <Label htmlFor="newsletter-preview">Inbox preview text</Label>
            <Input
              id="newsletter-preview"
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              maxLength={500}
              disabled={readOnly}
              placeholder="Short line under the subject (optional)"
            />
          </div>
          <div>
            <Label htmlFor="newsletter-sender-name">From name</Label>
            <Input
              id="newsletter-sender-name"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              placeholder="e.g. Evo Home Team"
              maxLength={120}
              disabled={readOnly}
            />
          </div>
          <CampaignSendingDomainField
            workspaceSlug={workspaceSlug}
            value={sending}
            onChange={setSending}
            disabled={readOnly}
          />
          <div>
            <Label htmlFor="newsletter-html-file">Upload HTML file</Label>
            <Input
              id="newsletter-html-file"
              type="file"
              accept=".html,text/html"
              disabled={readOnly}
              onChange={(event) => handleHtmlFile(event.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Accepts a single .html file. You can also paste HTML below.
            </p>
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="newsletter-html">HTML email</Label>
              <button
                type="button"
                className="text-[12px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                onClick={() => setPreviewOpen((open) => !open)}
              >
                {previewOpen ? "Hide preview" : "Show preview with sample data"}
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {CAMPAIGN_EMAIL_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  disabled={readOnly}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-[11.5px] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] disabled:opacity-50"
                  onClick={() => insertMergeField(variable.token)}
                  title={`Insert ${variable.label}`}
                >
                  {variable.label}
                </button>
              ))}
            </div>
            <Textarea
              id="newsletter-html"
              ref={htmlEditorRef}
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
              rows={14}
              className="font-mono text-[12px]"
              disabled={readOnly}
              placeholder="<html>… paste your email HTML here …</html>"
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Personalize with the buttons above. If your HTML doesn’t already include an
              unsubscribe link, we add a safe footer automatically when sending.
            </p>
            {htmlWarnings.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[12.5px]">
                {htmlWarnings.map((warning) => {
                  const blocking =
                    warning.code === "unsafe_tags" || warning.code === "unsafe_javascript";
                  return (
                    <li
                      key={`${warning.code}-${warning.message}`}
                      className={
                        blocking
                          ? "rounded-md border border-[var(--color-danger)]/25 px-2 py-1.5 text-[var(--color-danger)]"
                          : "rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[var(--color-ink-soft)]"
                      }
                    >
                      <span className="font-medium">
                        {blocking ? "Must fix before send: " : "Check: "}
                      </span>
                      {warning.message}
                    </li>
                  );
                })}
              </ul>
            ) : bodyHtml.trim() ? (
              <p className="mt-2 text-[12.5px] text-[var(--color-ink-muted)]">
                HTML looks usable. Preview it with sample merge data before you send.
              </p>
            ) : null}
          </div>
          {previewOpen && previewHtml ? (
            <div>
              <p className="mb-1 text-[12.5px] text-[var(--color-ink-muted)]">
                Preview uses sample data ({CAMPAIGN_EMAIL_PREVIEW_CONTEXT.firstName}{" "}
                {CAMPAIGN_EMAIL_PREVIEW_CONTEXT.lastName},{" "}
                {CAMPAIGN_EMAIL_PREVIEW_CONTEXT.projectName}).
              </p>
              <iframe
                title="Newsletter preview"
                className="h-[420px] w-full rounded-lg border border-[var(--color-line)] bg-white"
                srcDoc={previewHtml}
              />
            </div>
          ) : null}
        </section>
        ) : null}

        {wizardStep === "audience" ? (
        <section className="space-y-4" aria-labelledby="newsletter-step-audience">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="newsletter-step-audience"
                className="text-[15px] font-semibold text-[var(--color-ink)]"
              >
                Audience
              </h2>
              <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
                Choose who should receive this email. You can combine projects, tags, and CSV
                lists — duplicates are removed automatically.
              </p>
            </div>
            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setSegments((current) => [...current, createProjectTagsSegment()])
                  }
                >
                  Add project + tags
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setSegments((current) => [...current, createCsvImportSegment()])
                  }
                >
                  Add CSV list
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-[12.5px] text-[var(--color-ink-muted)]">
            When you send or schedule, we lock the recipient list so later tag changes don’t
            change who was included. CSV imports never start drip campaigns.
          </p>

          <div className="space-y-4">
            {segments.map((segment, index) => (
              <div
                key={segment.key}
                className="space-y-3 border-t border-[var(--color-line)] pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-[var(--color-ink)]">
                    Segment {index + 1}:{" "}
                    {segment.type === "csv_import" ? "CSV import" : "Project + tags"}
                  </p>
                  {!readOnly && segments.length > 1 ? (
                    <button
                      type="button"
                      className="text-[12px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-danger)]"
                      onClick={() => removeSegment(segment.key)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div>
                  <Label>Target project</Label>
                  <ProjectSelector
                    projects={projects}
                    selectedProjectId={segment.projectId}
                    onChange={
                      readOnly
                        ? undefined
                        : (projectId) =>
                            updateSegment(segment.key, (current) => ({
                              ...current,
                              projectId,
                            }))
                    }
                    disabled={readOnly}
                    searchable
                  />
                </div>

                {segment.type === "project_tags" ? (
                  <>
                    <div>
                      <Label>Lead tags (optional)</Label>
                      <TagSelector
                        tags={tags}
                        selectedTagIds={segment.tagIds}
                        entityType="lead"
                        onToggle={
                          readOnly
                            ? undefined
                            : (tagId) => toggleSegmentTag(segment.key, tagId)
                        }
                        readOnly={readOnly}
                        emptyLabel="No lead tags yet"
                      />
                    </div>
                    {segment.tagIds.length > 0 ? (
                      <div>
                        <Label htmlFor={`newsletter-tag-match-${segment.key}`}>
                          Tag match
                        </Label>
                        <Select
                          id={`newsletter-tag-match-${segment.key}`}
                          value={segment.tagMatch}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateSegment(segment.key, (current) =>
                              current.type === "project_tags"
                                ? {
                                    ...current,
                                    tagMatch: event.target.value as "any" | "all",
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="any">Match any selected tag</option>
                          <option value="all">Match all selected tags</option>
                        </Select>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div>
                      <Label>List tag for reuse (optional)</Label>
                      <TagSelector
                        tags={tags}
                        selectedTagIds={segment.applyTagId ? [segment.applyTagId] : []}
                        entityType="lead"
                        onToggle={
                          readOnly
                            ? undefined
                            : (tagId) =>
                                updateSegment(segment.key, (current) =>
                                  current.type === "csv_import"
                                    ? {
                                        ...current,
                                        applyTagId:
                                          current.applyTagId === tagId ? null : tagId,
                                      }
                                    : current,
                                )
                        }
                        readOnly={readOnly}
                        emptyLabel="No lead tags yet"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!readOnly ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!segment.projectId}
                          onClick={() => void openCsvImport(segment.key)}
                        >
                          {segment.importJobId ? "Re-import CSV" : "Upload CSV"}
                        </Button>
                      ) : null}
                      {segment.importJobId ? (
                        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                          Import ready
                          {segment.fileName ? `: ${segment.fileName}` : ""} (
                          {segment.importJobId.slice(-6)})
                        </p>
                      ) : (
                        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                          Map email (required); name, language, tags, and project are optional.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {audiencePreview ? (
            <div className="border-t border-[var(--color-line)] pt-3 text-[13px]">
              <p className="font-semibold text-[var(--color-ink)]">
                {audiencePreview.summary.queued.toLocaleString()} people will receive this
              </p>
              <p className="mt-1 text-[var(--color-ink-muted)]">
                Skipped — no email: {audiencePreview.exclusionCounts.missingEmail},
                unsubscribed: {audiencePreview.exclusionCounts.unsubscribed}, suppressed:{" "}
                {audiencePreview.exclusionCounts.suppressed}, invalid:{" "}
                {audiencePreview.exclusionCounts.invalid}, archived:{" "}
                {audiencePreview.exclusionCounts.archived}, duplicates removed:{" "}
                {audiencePreview.exclusionCounts.deduped}
              </p>
              {(audiencePreview.importSummaries?.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--color-ink-muted)]">
                  {audiencePreview.importSummaries?.map((summary) => (
                    <li key={summary.importJobId}>
                      CSV import …{summary.importJobId.slice(-6)}: created{" "}
                      {summary.createdCount}, already in CRM {summary.skippedCount}, failed{" "}
                      {summary.failedCount}, ready {summary.resolvedLeadCount} (
                      {summary.status})
                    </li>
                  ))}
                </ul>
              ) : null}
              {audiencePreview.summary.unknownConsent > 0 ? (
                <p className="mt-2 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1.5 text-[12.5px] text-[var(--color-ink)]">
                  {audiencePreview.summary.unknownConsent.toLocaleString()} contacts have
                  unknown email consent and will still be included. Check that before you send.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Save draft to refresh who is included. You can still continue and save again on
              Review.
            </p>
          )}
        </section>
        ) : null}

        {wizardStep === "review" ? (
        <section className="space-y-4" aria-labelledby="newsletter-step-review">
          <div>
            <h2
              id="newsletter-step-review"
              className="text-[15px] font-semibold text-[var(--color-ink)]"
            >
              Review & send
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
              Double-check the summary, preview the email, then send now or pick a time.
            </p>
          </div>
          <div className="space-y-2 text-[13px] text-[var(--color-ink-soft)]">
            <p>
              <span className="font-medium text-[var(--color-ink)]">From:</span>{" "}
              {senderName || "—"} &lt;{sending.senderEmail || "—"}&gt;
            </p>
            <p>
              <span className="font-medium text-[var(--color-ink)]">Subject:</span>{" "}
              {subject || "—"}
            </p>
            <p>
              <span className="font-medium text-[var(--color-ink)]">Preview text:</span>{" "}
              {previewText.trim() || "—"}
            </p>
            <p>
              <span className="font-medium text-[var(--color-ink)]">Recipients:</span>{" "}
              {audiencePreview?.summary.queued?.toLocaleString() ?? "Save draft to refresh"}
            </p>
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              Times use {formatWorkspaceTimezoneLabel(timezone)}.
            </p>
            {unsafeHtml ? (
              <p className="rounded-md border border-[var(--color-danger)]/25 px-2 py-1.5 text-[12.5px] text-[var(--color-danger)]">
                Fix unsafe HTML on the Content step before sending.
              </p>
            ) : null}
            {htmlWarnings.some((warning) => warning.code === "missing_unsubscribe") ? (
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                No unsubscribe link in your HTML — a footer will be added automatically.
              </p>
            ) : null}
          </div>
          {previewHtml ? (
            <div>
              <p className="mb-1 text-[12.5px] text-[var(--color-ink-muted)]">
                Preview with sample merge data
              </p>
              <iframe
                title="Newsletter review preview"
                className="h-[360px] w-full rounded-lg border border-[var(--color-line)] bg-white"
                srcDoc={previewHtml}
              />
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Add HTML on the Content step to see a preview here.
            </p>
          )}
          <div>
            <Label htmlFor="newsletter-schedule">Send later (optional)</Label>
            <Input
              id="newsletter-schedule"
              type="datetime-local"
              value={scheduledForLocal}
              disabled={readOnly}
              onChange={(event) => setScheduledForLocal(event.target.value)}
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Leave empty to use Send now. You can cancel a scheduled send until it starts.
            </p>
          </div>
          {canUpdate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={submitting || unsafeHtml || !contentReady || !audienceReady}
                onClick={() => void handleSendNow()}
              >
                {submitting ? "Working…" : "Send now"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  submitting ||
                  unsafeHtml ||
                  !contentReady ||
                  !audienceReady ||
                  !scheduledForLocal
                }
                onClick={() => void handleSchedule()}
              >
                Schedule send
              </Button>
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Ask for campaign update permission to send or schedule.
            </p>
          )}
        </section>
        ) : null}
      </form>

      {newsletterIdForImport && activeCsvSegment?.projectId ? (
        <ImportWizard
          open={csvImportOpen}
          onClose={() => {
            setCsvImportOpen(false);
            setCsvImportSegmentKey(null);
          }}
          workspaceSlug={workspaceSlug}
          entityType="lead"
          newsletterMode
          createEndpoint={`${apiNewsletters}/${newsletterIdForImport}/audience/import`}
          uploadFields={{
            targetProjectId: activeCsvSegment.projectId,
            ...(activeCsvSegment.applyTagId
              ? { applyTagId: activeCsvSegment.applyTagId }
              : {}),
          }}
          lockedProjectId={activeCsvSegment.projectId}
          lockedTagId={activeCsvSegment.applyTagId}
          onCompleteWithJob={(jobId) => {
            setSegments((current) => {
              const next = current.map((segment) =>
                segment.key === activeCsvSegment.key && segment.type === "csv_import"
                  ? { ...segment, importJobId: jobId }
                  : segment,
              );

              const id = newsletterIdForImport;
              if (id) {
                const payload = {
                  segments: next
                    .filter(
                      (segment) =>
                        segment.projectId &&
                        (segment.type === "project_tags" ||
                          (segment.type === "csv_import" && segment.importJobId)),
                    )
                    .map((segment, index) =>
                      segment.type === "csv_import"
                        ? {
                            type: "csv_import" as const,
                            order: index + 1,
                            projectId: segment.projectId!,
                            importJobId: segment.importJobId!,
                            applyTagId: segment.applyTagId,
                          }
                        : {
                            type: "project_tags" as const,
                            order: index + 1,
                            projectId: segment.projectId!,
                            tagIds: segment.tagIds,
                            tagMatch: segment.tagMatch,
                          },
                    ),
                };

                if (payload.segments.length > 0) {
                  void fetch(`${apiNewsletters}/${id}/audience/segments`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  }).then(() => refreshAudiencePreview(id));
                }
              }

              return next;
            });
          }}
        />
      ) : null}
    </FocusedFormLayout>
  );
}
