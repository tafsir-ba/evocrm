"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_BODY_CHARS,
  MAX_FEEDBACK_SCREENSHOTS,
  type FeedbackCategory,
  type FeedbackScreenshotDraft,
  getFeedbackCategoryLabel,
  parseFeedbackContextFromPathname,
  validateFeedbackScreenshotClient,
  isFeedbackScreenshotDuplicate,
} from "@/lib/feedback";
import { IconInbox } from "@/lib/icons";
import { FeedbackScreenshotDropzone } from "@/components/feedback/feedback-screenshot-dropzone";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function FeedbackWidget() {
  const { workspace } = useWorkspaceShell();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [body, setBody] = useState("");
  const [screenshots, setScreenshots] = useState<FeedbackScreenshotDraft[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const resetForm = useCallback(() => {
    setCategory("bug");
    setBody("");
    setScreenshots((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setSubmitState("idle");
    setErrorMessage(null);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    resetForm();
  }, [resetForm]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [screenshots]);

  function addScreenshots(files: File[]) {
    const next = [...screenshots];

    for (const file of files) {
      if (next.length >= MAX_FEEDBACK_SCREENSHOTS) {
        showToast("You can attach up to 5 screenshots.");
        break;
      }

      const validationError = validateFeedbackScreenshotClient(file);
      if (validationError) {
        showToast(validationError);
        continue;
      }

      if (isFeedbackScreenshotDuplicate(file, next)) {
        showToast("That screenshot is already attached.");
        continue;
      }

      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setScreenshots(next);
  }

  function removeScreenshot(id: string) {
    setScreenshots((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit() {
    const trimmedBody = body.trim();

    if (!trimmedBody && screenshots.length === 0) {
      setErrorMessage("Add a message or at least one screenshot.");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage(null);

    const { projectId } = parseFeedbackContextFromPathname(pathname);
    const formData = new FormData();
    formData.set("category", category);
    formData.set("workspace_slug", workspace.slug);

    if (trimmedBody) {
      formData.set("body", trimmedBody);
    }

    formData.set("page_url", window.location.href);
    formData.set("user_agent", navigator.userAgent);

    if (projectId) {
      formData.set("project_id", projectId);
    }

    for (const screenshot of screenshots) {
      formData.append("screenshots", screenshot.file);
    }

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        data?: { ok?: boolean; id?: string };
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        if (payload.error?.code === "RATE_LIMITED") {
          showToast("Too many submissions — try again later.");
        } else {
          setErrorMessage(payload.error?.message ?? "Could not send feedback.");
        }
        setSubmitState("error");
        return;
      }

      showToast("Thanks — feedback sent");
      closeModal();
    } catch {
      setErrorMessage("Could not send feedback. Please try again.");
      setSubmitState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="feedback-trigger"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--color-ink)] shadow-[var(--shadow-md)] hover:border-[var(--color-brand-600)] focus-ring"
      >
        <IconInbox size={16} />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 right-5 z-50 rounded-lg border border-[var(--color-line)] bg-white px-4 py-3 text-[13px] text-[var(--color-ink)] shadow-[var(--shadow-md)]"
        >
          {toastMessage}
        </div>
      )}

      <Modal open={open} onClose={closeModal} title="Send feedback" className="max-w-xl">
        <div data-testid="feedback-dialog" className="space-y-4">
          <div>
            <p className="mb-2 text-[12px] font-medium text-[var(--color-ink-muted)]">Category</p>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`feedback-category-${value}`}
                  onClick={() => setCategory(value)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    category === value
                      ? "border-[var(--color-brand-600)] bg-[color-mix(in_srgb,var(--color-brand-600)_8%,white)] text-[var(--color-brand-700)]"
                      : "border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-brand-600)]",
                  ].join(" ")}
                >
                  {getFeedbackCategoryLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="feedback-body" className="mb-2 block text-[12px] font-medium text-[var(--color-ink-muted)]">
              Message
            </label>
            <Textarea
              id="feedback-body"
              data-testid="feedback-body"
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, MAX_FEEDBACK_BODY_CHARS))}
              rows={5}
              placeholder="What happened? What were you trying to do?"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--color-ink-muted)]">
              {body.length}/{MAX_FEEDBACK_BODY_CHARS}
            </p>
          </div>

          <FeedbackScreenshotDropzone
            disabled={submitState === "submitting"}
            screenshots={screenshots}
            onAddFiles={addScreenshots}
            onRemove={removeScreenshot}
          />

          {errorMessage && (
            <p className="text-[12px] text-[var(--color-danger-fg)]" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-4">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="feedback-submit"
              disabled={submitState === "submitting"}
              onClick={() => void handleSubmit()}
            >
              {submitState === "submitting" ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
