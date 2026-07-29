"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { EmailRichTextEditor } from "@/components/campaigns/email-rich-text-editor";
import {
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
  applyCampaignVariables,
  buildCampaignEmailHtml,
  CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
  CAMPAIGN_EMAIL_VARIABLES,
  normalizeCampaignSendTime,
  stripHtmlToPlainText,
  validateCampaignHtml,
} from "@/lib/campaign-email";
import {
  formatDocumentFileSize,
  validateDocumentFileClient,
  type DocumentListItem,
} from "@/lib/documents";
import { IconClose, IconPaperclip, IconUpload } from "@/lib/icons";
import { formatWorkspaceTimezoneLabel } from "@/lib/workspace-datetime";
import { workspacePath } from "@/lib/workspace-paths";
import { cn } from "@/lib/utils";
import { MAX_CAMPAIGN_EMAIL_ATTACHMENTS } from "@/lib/campaign-email-attachments";

type ContentMode = "plain_text" | "rich_text" | "html";

type StepFormState = {
  name: string;
  order: string;
  delayDays: string;
  sendTime: string;
  fromName: string;
  subject: string;
  previewText: string;
  contentMode: ContentMode;
  body: string;
  bodyHtml: string;
  bodyText: string;
  documentIds: string[];
  status: "draft" | "ready" | "active" | "paused";
};

type CampaignStepApiRecord = {
  name?: string | null;
  order: number;
  delayDays: number;
  sendTime: string;
  fromName?: string | null;
  subject?: string | null;
  previewText?: string | null;
  contentMode?: ContentMode;
  body?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  documentIds?: string[];
  status?: StepFormState["status"];
};

type AttachmentItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

function mapStepToFormState(
  step: CampaignStepApiRecord,
  campaignDefaultFromName = "",
): StepFormState {
  return {
    name: step.name ?? step.subject ?? "",
    order: String(step.order),
    delayDays: String(step.delayDays),
    sendTime: normalizeCampaignSendTime(step.sendTime),
    fromName: step.fromName?.trim() || campaignDefaultFromName,
    subject: step.subject ?? "",
    previewText: step.previewText ?? "",
    contentMode: step.contentMode ?? "rich_text",
    body: step.body ?? "",
    bodyHtml: step.bodyHtml ?? "",
    bodyText: step.bodyText ?? "",
    documentIds: step.documentIds ?? [],
    status: step.status ?? "draft",
  };
}

type SaveIntent = "preserve" | "draft" | "ready";

const emptyStepForm: StepFormState = {
  name: "",
  order: "1",
  delayDays: "0",
  sendTime: "09:00",
  fromName: "",
  subject: "",
  previewText: "",
  contentMode: "rich_text",
  body: "",
  bodyHtml: "",
  bodyText: "",
  documentIds: [],
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
  const documentsApiBase = `/api/workspaces/${workspaceSlug}/documents`;
  const formId = "campaign-step-form";

  const [campaignName, setCampaignName] = useState("");
  const [campaignStatus, setCampaignStatus] = useState<string>("draft");
  const [campaignDefaultFromName, setCampaignDefaultFromName] = useState("");
  const [stepPosition, setStepPosition] = useState({ current: 1, total: 1 });
  const [form, setForm] = useState<StepFormState>(emptyStepForm);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const bodyFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const richEditorRef = useRef<Editor | null>(null);

  const contentLocked = campaignStatus === "active";

  const loadAttachments = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0) {
        setAttachments([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          pageSize: "50",
          linkedEntityType: "campaign",
          linkedEntityId: campaignId,
        });
        const response = await fetch(`${documentsApiBase}?${params.toString()}`);
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { data: DocumentListItem[] };
        const byId = new Map(body.data.map((item) => [item.id, item]));
        setAttachments(
          documentIds
            .map((id) => byId.get(id))
            .filter((item): item is DocumentListItem => Boolean(item))
            .map((item) => ({
              id: item.id,
              fileName: item.fileName,
              fileSize: item.fileSize,
              mimeType: item.mimeType,
            })),
        );
      } catch {
        // Keep existing chips if listing fails; save still stores documentIds.
      }
    },
    [campaignId, documentsApiBase],
  );

  const loadAttachmentsRef = useRef(loadAttachments);
  loadAttachmentsRef.current = loadAttachments;

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
        const defaultFromName =
          (campaign?.senderName ?? campaign?.defaultFromName ?? "").trim();
        setCampaignName(campaign?.name ?? "Campaign");
        setCampaignStatus(campaign?.status ?? "draft");
        setCampaignDefaultFromName(defaultFromName);

        if (isEdit && stepId) {
          const step = steps.find((item: { id: string }) => item.id === stepId);
          if (!step) {
            throw new Error("Step not found.");
          }

          setStepPosition({
            current: step.order,
            total: steps.length,
          });
          const mapped = mapStepToFormState(step, defaultFromName);
          setForm(mapped);
          await loadAttachmentsRef.current(mapped.documentIds);
          return;
        }

        setStepPosition({ current: steps.length + 1, total: steps.length + 1 });
        setForm({
          ...emptyStepForm,
          order: String(steps.length + 1),
          name: `Email ${steps.length + 1}`,
          fromName: defaultFromName,
        });
        setAttachments([]);
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

  const previewHtml = useMemo(() => {
    const previewUnsubscribeUrl =
      CAMPAIGN_EMAIL_PREVIEW_CONTEXT.unsubscribeUrl ?? "https://example.com/unsubscribe";

    if (form.contentMode === "html" || form.contentMode === "rich_text") {
      const resolvedHtml = applyCampaignVariables(
        form.bodyHtml || "<p>No content yet.</p>",
        CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
      );
      return buildCampaignEmailHtml("", previewUnsubscribeUrl, {
        htmlBody: resolvedHtml,
        previewText: form.previewText.trim() || null,
      });
    }

    const resolvedBody = applyCampaignVariables(
      form.body || "No content yet.",
      CAMPAIGN_EMAIL_PREVIEW_CONTEXT,
    );
    return buildCampaignEmailHtml(resolvedBody, previewUnsubscribeUrl, {
      previewText: form.previewText.trim() || null,
    });
  }, [form.body, form.bodyHtml, form.contentMode, form.previewText]);

  function readLiveSendTime(): string {
    if (typeof document !== "undefined") {
      const formElement = document.getElementById(formId);
      if (formElement instanceof HTMLFormElement) {
        const formData = new FormData(formElement);
        const live = String(formData.get("sendTime") ?? "").trim();
        if (live) {
          return normalizeCampaignSendTime(live);
        }
      }
    }
    return normalizeCampaignSendTime(form.sendTime);
  }

  function buildPayload(intent: SaveIntent) {
    const contentMode = form.contentMode;
    const body =
      contentMode === "html"
        ? form.bodyText || form.body
        : contentMode === "rich_text"
          ? form.bodyText || stripHtmlToPlainText(form.bodyHtml) || form.body
          : form.body;
    const bodyHtml =
      contentMode === "html" || contentMode === "rich_text" ? form.bodyHtml || null : null;
    const bodyText =
      contentMode === "rich_text"
        ? form.bodyText || stripHtmlToPlainText(form.bodyHtml)
        : form.bodyText || form.body;

    const trimmedName = form.name.trim();
    const normalizedSendTime = readLiveSendTime();

    const trimmedFromName = form.fromName.trim();
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
      documentIds: form.documentIds,
    };

    if (!isEdit) {
      return {
        ...payload,
        ...(trimmedFromName ? { fromName: trimmedFromName } : {}),
        status: intent === "ready" ? "ready" : "draft",
        channel: "email" as const,
      };
    }

    if (intent === "preserve") {
      if (campaignStatus === "active") {
        return {
          ...(trimmedName ? { name: trimmedName } : { name: null }),
          delayDays: parseInt(form.delayDays, 10),
          sendTime: normalizedSendTime,
        };
      }

      return {
        ...payload,
        fromName: trimmedFromName || null,
      };
    }

    return {
      ...payload,
      fromName: trimmedFromName || null,
      status: intent,
    };
  }

  function formatSaveError(payload: {
    error?: { message?: string; details?: Record<string, string[]> };
  }) {
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
    if (submitting) {
      return;
    }

    setFormError(null);
    setFormMessage(null);

    setSubmitting(true);

    try {
      const requestPayload = buildPayload(intent);
      const requestedSendTime = normalizeCampaignSendTime(
        String(
          "sendTime" in requestPayload && typeof requestPayload.sendTime === "string"
            ? requestPayload.sendTime
            : form.sendTime,
        ),
      );

      // Keep React state aligned with the live input before/after save.
      setForm((current) =>
        current.sendTime === requestedSendTime
          ? current
          : { ...current, sendTime: requestedSendTime },
      );

      const url = isEdit ? `${apiBase}/steps/${stepId}` : `${apiBase}/steps`;
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
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
      }

      const savedStep = payload.data?.step;
      if (savedStep && typeof savedStep === "object") {
        const mapped = mapStepToFormState(
          savedStep as CampaignStepApiRecord,
          campaignDefaultFromName,
        );
        const savedSendTime = normalizeCampaignSendTime(mapped.sendTime);
        if (savedSendTime !== requestedSendTime) {
          setFormError(
            `Send time did not save (wanted ${requestedSendTime}, got ${savedSendTime}). Try again.`,
          );
          setForm((current) => ({
            ...current,
            ...mapped,
            sendTime: requestedSendTime,
          }));
          return;
        }
        setForm((current) => ({
          ...current,
          ...mapped,
          sendTime: savedSendTime,
        }));
        await loadAttachments(mapped.documentIds);
      }

      setFormMessage(
        intent === "ready"
          ? "Email marked as ready."
          : intent === "preserve"
            ? campaignStatus === "active"
              ? "Schedule updated. Enrolled recipients were rescheduled."
              : "Changes saved."
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
    if (token === "{unsubscribe_url}") {
      if (form.contentMode === "rich_text" && richEditorRef.current) {
        richEditorRef.current
          .chain()
          .focus()
          .insertContent('<a href="{unsubscribe_url}">Unsubscribe</a>')
          .run();
        return;
      }

      if (field === "bodyHtml") {
        setForm((current) => {
          const source = current.bodyHtml;
          const element = bodyFieldRef.current;
          const start = element?.selectionStart ?? source.length;
          const end = element?.selectionEnd ?? source.length;
          const before = source.slice(0, start);
          const after = source.slice(end);
          const inserted = `${before}<a href="{unsubscribe_url}">Unsubscribe</a>${after}`;
          return {
            ...current,
            bodyHtml: inserted,
            bodyText: stripHtmlToPlainText(inserted),
          };
        });
        return;
      }

      // Plain text: unsubscribe footer is appended automatically at send time.
      return;
    }

    if (form.contentMode === "rich_text" && richEditorRef.current) {
      richEditorRef.current.chain().focus().insertContent(token).run();
      return;
    }

    setForm((current) => {
      const source = current[field];
      const element = bodyFieldRef.current;
      const start = element?.selectionStart ?? source.length;
      const end = element?.selectionEnd ?? source.length;
      let before = source.slice(0, start);
      const after = source.slice(end);

      if (before.endsWith("{") && token.startsWith("{")) {
        before = before.slice(0, -1);
      }

      const inserted = `${before}${token}${after}`;

      if (field === "bodyHtml") {
        return {
          ...current,
          bodyHtml: inserted,
          bodyText: stripHtmlToPlainText(inserted),
        };
      }

      return {
        ...current,
        body: inserted,
        bodyText: inserted,
        bodyHtml:
          current.contentMode === "rich_text"
            ? inserted.replace(/\n/g, "<br />")
            : current.bodyHtml,
      };
    });
  }

  function switchContentMode(mode: ContentMode) {
    setForm((current) => {
      if (current.contentMode === mode) {
        return current;
      }

      if (mode === "plain_text") {
        const plain =
          current.bodyText ||
          stripHtmlToPlainText(current.bodyHtml) ||
          current.body;
        return {
          ...current,
          contentMode: mode,
          body: plain,
          bodyText: plain,
        };
      }

      if (mode === "rich_text") {
        const html =
          current.bodyHtml?.trim() ||
          (current.body ? `<p>${current.body.replace(/\n/g, "<br />")}</p>` : "");
        return {
          ...current,
          contentMode: mode,
          bodyHtml: html,
          bodyText: stripHtmlToPlainText(html) || current.body,
          body: stripHtmlToPlainText(html) || current.body,
        };
      }

      const html =
        current.bodyHtml?.trim() ||
        (current.body ? `<p>${current.body.replace(/\n/g, "<br />")}</p>` : "");
      return {
        ...current,
        contentMode: mode,
        bodyHtml: html,
        bodyText: stripHtmlToPlainText(html) || current.body,
      };
    });
  }

  async function handleUpload(file: File) {
    if (contentLocked) {
      return;
    }

    if (form.documentIds.length >= MAX_CAMPAIGN_EMAIL_ATTACHMENTS) {
      setFormError(`You can attach up to ${MAX_CAMPAIGN_EMAIL_ATTACHMENTS} files.`);
      return;
    }

    const validationError = validateDocumentFileClient(file);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setUploading(true);
    setFormError(null);

    try {
      const uploadUrlResponse = await fetch(`${documentsApiBase}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedEntityType: "campaign",
          linkedEntityId: campaignId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          visibility: "private",
        }),
      });

      if (!uploadUrlResponse.ok) {
        const body = await uploadUrlResponse.json();
        throw new Error(body.error?.message ?? "Failed to start upload.");
      }

      const uploadUrlBody = (await uploadUrlResponse.json()) as {
        data: {
          upload: {
            uploadId: string;
            uploadUrl: string;
            storageKey: string;
          };
        };
      };

      const { uploadId, uploadUrl, storageKey } = uploadUrlBody.data.upload;

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error("Failed to upload file to storage.");
      }

      const confirmResponse = await fetch(`${documentsApiBase}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          storageKey,
          linkedEntityType: "campaign",
          linkedEntityId: campaignId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          visibility: "private",
        }),
      });

      if (!confirmResponse.ok) {
        const body = await confirmResponse.json();
        throw new Error(body.error?.message ?? "Failed to confirm upload.");
      }

      const confirmBody = (await confirmResponse.json()) as {
        data: { document: DocumentListItem };
      };
      const document = confirmBody.data.document;

      setForm((current) => ({
        ...current,
        documentIds: [...current.documentIds, document.id],
      }));
      setAttachments((current) => [
        ...current,
        {
          id: document.id,
          fileName: document.fileName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
        },
      ]);
      setFormMessage("Attachment added. Save the email to keep it.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to upload attachment.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeAttachment(documentId: string) {
    if (contentLocked) {
      return;
    }

    setForm((current) => ({
      ...current,
      documentIds: current.documentIds.filter((id) => id !== documentId),
    }));
    setAttachments((current) => current.filter((item) => item.id !== documentId));
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

  return (
    <FocusedFormLayout
      title={isEdit ? form.name || "Edit email" : "Add email step"}
      description={`Campaign: ${campaignName} · Step ${stepPosition.current} of ${stepPosition.total}`}
      closeHref={closeHref}
      maxWidth="full"
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
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void saveStep("preserve")}
              >
                Save
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => void saveStep("draft")}
            >
              Save draft
            </Button>
            <Button
              type="button"
              disabled={submitting}
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

        {contentLocked ? (
          <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[12.5px] text-[var(--color-ink-muted)]">
            This campaign is active. You can update send time and delay here; pause the campaign
            to edit email content.
          </p>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.85fr)] gap-4">
          <Card padded={false} className="overflow-hidden">
            <div className="border-b border-[var(--color-line)] px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="step-from-name"
                  className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]"
                >
                  From
                </label>
                <input
                  id="step-from-name"
                  value={form.fromName}
                  disabled={contentLocked}
                  onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
                  maxLength={120}
                  placeholder="Contact name shown in the inbox (e.g. Grosvenor)"
                  className="h-9 w-full bg-transparent text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none focus-ring rounded-md"
                />
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="step-subject"
                  className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]"
                >
                  Subject
                </label>
                <input
                  id="step-subject"
                  value={form.subject}
                  disabled={contentLocked}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  maxLength={500}
                  placeholder="Email subject"
                  className="h-9 w-full bg-transparent text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none focus-ring rounded-md"
                />
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="step-preview-text"
                  className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]"
                >
                  Preview
                </label>
                <input
                  id="step-preview-text"
                  value={form.previewText}
                  disabled={contentLocked}
                  onChange={(e) => setForm((f) => ({ ...f, previewText: e.target.value }))}
                  maxLength={500}
                  placeholder="Inbox preview text (optional)"
                  className="h-9 w-full bg-transparent text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none focus-ring rounded-md"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["rich_text", "Compose"],
                    ["plain_text", "Plain text"],
                    ["html", "HTML"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={contentLocked}
                    onClick={() => switchContentMode(mode)}
                    className={cn(
                      "h-8 rounded-md px-2.5 text-[12.5px] font-medium focus-ring",
                      form.contentMode === mode
                        ? "bg-white text-[var(--color-ink)] shadow-sm border border-[var(--color-line)]"
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUpload(file);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={contentLocked || uploading}
                  leadingIcon={<IconPaperclip size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Attach"}
                </Button>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {form.contentMode === "rich_text" ? (
                <EmailRichTextEditor
                  valueHtml={form.bodyHtml}
                  disabled={contentLocked}
                  editorRef={(editor) => {
                    richEditorRef.current = editor;
                  }}
                  onChange={(html, plainText) =>
                    setForm((current) => ({
                      ...current,
                      bodyHtml: html,
                      bodyText: plainText,
                      body: plainText,
                    }))
                  }
                />
              ) : form.contentMode === "html" ? (
                <div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {CAMPAIGN_EMAIL_VARIABLES.map((variable) => (
                      <Button
                        key={variable.key}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={contentLocked}
                        onClick={() => insertVariable(variable.token, "bodyHtml")}
                      >
                        {variable.label}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    id="step-body-html"
                    ref={bodyFieldRef}
                    value={form.bodyHtml}
                    disabled={contentLocked}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        bodyHtml: e.target.value,
                        bodyText: stripHtmlToPlainText(e.target.value),
                      }))
                    }
                    rows={14}
                    className="min-h-[18rem] font-mono text-[12.5px]"
                  />
                  {htmlWarnings.map((warning) => (
                    <p key={warning.code} className="text-[12px] text-[var(--color-warning)] mt-2">
                      {warning.message}
                    </p>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {CAMPAIGN_EMAIL_VARIABLES.map((variable) => (
                      <Button
                        key={variable.key}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={contentLocked}
                        onClick={() => insertVariable(variable.token, "body")}
                      >
                        {variable.label}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    id="step-body"
                    ref={bodyFieldRef}
                    value={form.body}
                    disabled={contentLocked}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        body: e.target.value,
                        bodyText: e.target.value,
                      }))
                    }
                    rows={14}
                    className="min-h-[18rem]"
                    placeholder="Write your email…"
                  />
                </div>
              )}

              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 py-1.5 text-[12.5px]"
                    >
                      <IconUpload size={13} className="shrink-0 text-[var(--color-ink-muted)]" />
                      <span className="truncate font-medium text-[var(--color-ink)]">
                        {attachment.fileName}
                      </span>
                      <span className="shrink-0 text-[var(--color-ink-muted)]">
                        {formatDocumentFileSize(attachment.fileSize)}
                      </span>
                      {!contentLocked ? (
                        <button
                          type="button"
                          aria-label={`Remove ${attachment.fileName}`}
                          className="rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink)] focus-ring"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <IconClose size={13} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="text-[12px] text-[var(--color-ink-muted)]">
                An unsubscribe link is added automatically when this email is sent.
              </p>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-3">
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">When to send</h3>
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
                  key={`send-time-${stepId ?? "new"}-${form.sendTime}`}
                  name="sendTime"
                  type="time"
                  step={60}
                  defaultValue={form.sendTime}
                />
                <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                  {formatWorkspaceTimezoneLabel(workspace.timezone)}
                </p>
              </div>
            </Card>

            <Card>
              <h3 className="text-[14px] font-semibold text-[var(--color-ink)] mb-2">Preview</h3>
              <div
                className="max-h-[16rem] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 text-[13px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </Card>

            {isEdit ? (
              <Card>
                <h3 className="text-[14px] font-semibold text-[var(--color-ink)] mb-2">Test email</h3>
                <div className="flex flex-col gap-2">
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
          </div>
        </div>
      </form>
    </FocusedFormLayout>
  );
}
