"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { workspaceNavPath } from "@/lib/workspace-paths";

type DeleteWorkspaceButtonProps = {
  workspaceSlug: string;
  workspaceName: string;
  redirectTo?: string;
  size?: "sm" | "md" | "lg";
  variant?: "secondary" | "ghost";
};

export function DeleteWorkspaceButton({
  workspaceSlug,
  workspaceName,
  redirectTo = "/workspaces",
  size = "sm",
  variant = "secondary",
}: DeleteWorkspaceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setConfirmName("");
    setError(null);
  }

  async function handleDelete() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not delete workspace.");
      }

      closeModal();
      router.push(redirectTo);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  const canDelete = confirmName === workspaceName;

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        Delete workspace
      </Button>

      <Modal
        open={open}
        onClose={closeModal}
        title="Delete workspace?"
        className="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!canDelete || submitting}
            >
              {submitting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            This permanently deletes <strong>{workspaceName}</strong> and all CRM data inside it:
            leads, properties, opportunities, activities, documents, campaigns, settings, members,
            and audit history. This cannot be undone.
          </p>
          <label className="block space-y-1.5">
            <span className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
              Type the workspace name to confirm
            </span>
            <Input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={workspaceName}
              autoComplete="off"
            />
          </label>
          {error && (
            <p className="text-[12.5px] text-[var(--color-danger-fg)]" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

type WorkspaceListItemProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    type: string;
    timezone: string;
    defaultCurrency: string;
    roleKey: string;
    isOwner: boolean;
    canEdit: boolean;
  };
  initials: string;
};

export function WorkspaceListItem({ workspace, initials }: WorkspaceListItemProps) {
  return (
    <li className="rounded-xl border border-[var(--color-line)] bg-white">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
        <a
          href={workspaceNavPath(workspace.slug, "dashboard")}
          className="flex min-w-0 flex-1 items-center gap-3 focus-ring rounded-lg"
        >
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
            }}
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[var(--color-ink)]">
              {workspace.name}
            </span>
            <span className="block text-[12.5px] text-[var(--color-ink-muted)]">
              {workspace.type} · {workspace.timezone} · {workspace.defaultCurrency} ·{" "}
              {workspace.roleKey}
            </span>
          </span>
        </a>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {workspace.canEdit && (
            <Link
              href={workspaceNavPath(workspace.slug, "settings/workspace")}
              className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-3 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)] focus-ring"
            >
              Edit
            </Link>
          )}
          {workspace.isOwner && (
            <DeleteWorkspaceButton
              workspaceSlug={workspace.slug}
              workspaceName={workspace.name}
            />
          )}
        </div>
      </div>
    </li>
  );
}
