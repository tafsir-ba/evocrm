"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";

import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type LeadQuickNoteProps = {
  workspaceSlug: string;
  leadId: string;
  leadName: string;
  onSave: (body: string, followUpIso: string | null) => Promise<void>;
};

export function LeadQuickNote({ workspaceSlug, leadId, leadName, onSave }: LeadQuickNoteProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed, followUpAt ? new Date(followUpAt).toISOString() : null);
      setBody("");
      setFollowUpAt("");
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Add quick note for ${leadName}`}
        title={body.trim() ? "Continue draft note" : "Add quick note"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-100)]"
      >
        <IconPlus size={12} />
      </button>

      <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        onClose={close}
        label={`Quick note for ${leadName}`}
        width={300}
        align="right"
        className="p-2.5"
      >
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-[var(--color-ink)]">Quick note</p>
            <Link
              href={workspacePath(workspaceSlug, "leads", leadId)}
              className="text-[11px] font-medium text-[var(--color-brand-700)] hover:underline"
            >
              Open lead
            </Link>
          </div>
          <textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            rows={3}
            placeholder="e.g. Followed up on WhatsApp, waiting for financing…"
            aria-label="Note"
            className="w-full resize-y rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[12.5px] leading-snug text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)]"
          />
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--color-ink-muted)]">
            <span className="shrink-0">Follow up</span>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(event) => setFollowUpAt(event.target.value)}
              aria-label="Follow up (optional)"
              className="h-7 min-w-0 flex-1 rounded-md border border-[var(--color-line)] px-1.5 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-brand-500)] focus:outline-none"
            />
          </label>
          {error ? (
            <p role="alert" className="text-[12px] text-[var(--color-danger-fg)]">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-ink-faint)]">
              Saved to the lead&apos;s Notes · ⌘↵
            </span>
            <Button type="submit" size="sm" className="h-7 px-2.5 text-[12px]" disabled={!body.trim() || saving}>
              {saving ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      </AnchoredPopover>
    </>
  );
}
