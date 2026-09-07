"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus } from "@/lib/icons";
import {
  canAssignProjectRole,
  PROJECT_ROLE_DISPLAY_DEFINITIONS,
  type ProjectRoleKey,
} from "@/lib/project-sharing-roles";

type GrantItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  projectRole: ProjectRoleKey;
  projectRoleName: string;
  status: string;
  createdAt: string;
};

type SharingData = {
  grants: GrantItem[];
  canShare: boolean;
  canManageGrants: boolean;
  actorProjectRole: ProjectRoleKey;
};

type ProjectSharingPanelProps = {
  workspaceSlug: string;
  projectId: string;
  canShare: boolean;
  canManageGrants: boolean;
  actorProjectRole: ProjectRoleKey;
};

export function ProjectSharingPanel({
  workspaceSlug,
  projectId,
  canShare,
  canManageGrants,
  actorProjectRole,
}: ProjectSharingPanelProps) {
  const [data, setData] = useState<SharingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<ProjectRoleKey>("contributor");
  const [sharing, setSharing] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}/projects/${projectId}/sharing`;

  const roleOptions = useMemo(() => {
    const effectiveRole = data?.actorProjectRole ?? actorProjectRole;
    const manage = data?.canManageGrants ?? canManageGrants;
    return PROJECT_ROLE_DISPLAY_DEFINITIONS.filter(
      (role) => manage || canAssignProjectRole(effectiveRole, role.key),
    );
  }, [actorProjectRole, canManageGrants, data?.actorProjectRole, data?.canManageGrants]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiBase);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "Failed to load sharing data.");
      }
      const body = await response.json();
      setData(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load sharing data.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleShare() {
    if (!shareEmail.trim()) return;
    setSharing(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: shareEmail.trim(),
          projectRole: shareRole,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error?.message ?? "Could not share project.");
        return;
      }

      setShareOpen(false);
      setShareEmail("");
      setShareRole("contributor");
      setSuccessMessage(payload.data?.message ?? "Access granted.");
      await loadData();
    } catch {
      setActionError("Could not share project.");
    } finally {
      setSharing(false);
    }
  }

  async function handleChangeRole(userId: string, projectRole: string) {
    setActionError(null);
    setSuccessMessage(null);
    const response = await fetch(apiBase, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, projectRole }),
    });
    if (!response.ok) {
      const body = await response.json();
      setActionError(body.error?.message ?? "Failed to change role.");
      return;
    }
    await loadData();
  }

  async function handleRemoveAccess(userId: string) {
    setActionError(null);
    setSuccessMessage(null);
    const response = await fetch(apiBase, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      const body = await response.json();
      setActionError(body.error?.message ?? "Failed to remove access.");
      return;
    }
    await loadData();
  }

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-8 w-full mb-2" />
        <Skeleton className="h-8 w-full mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load sharing"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadData() }}
      />
    );
  }

  const grants = data?.grants ?? [];
  const showShare = data?.canShare ?? canShare;
  const manageGrants = data?.canManageGrants ?? canManageGrants;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">
              Share project
            </h3>
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
              Grant access to a registered EvoCRM user by email. Access is applied immediately.
            </p>
          </div>
          {showShare ? (
            <Button
              size="sm"
              leadingIcon={<IconPlus size={14} />}
              onClick={() => {
                setActionError(null);
                setShareOpen(true);
              }}
            >
              Share project
            </Button>
          ) : null}
        </div>

        {successMessage ? (
          <p className="text-[12.5px] text-[var(--color-success-fg,var(--color-brand-700))] mb-3">
            {successMessage}
          </p>
        ) : null}
        {actionError ? (
          <p className="text-[12.5px] text-[var(--color-danger-fg)] mb-3">{actionError}</p>
        ) : null}

        {grants.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ink-muted)] py-4 text-center">
            Only you have access so far. Share the project with a teammate by email.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
              People with access
            </p>
            {grants.map((grant) => (
              <div
                key={grant.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)] truncate">
                    {grant.userName ?? grant.userEmail}
                  </p>
                  {grant.userName ? (
                    <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                      {grant.userEmail}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {manageGrants ? (
                    <select
                      value={grant.projectRole}
                      onChange={(e) => void handleChangeRole(grant.userId, e.target.value)}
                      className="h-7 rounded-md border border-[var(--color-line)] px-2 text-[12px] bg-white"
                    >
                      {PROJECT_ROLE_DISPLAY_DEFINITIONS.map((role) => (
                        <option key={role.key} value={role.key}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="muted" size="sm">
                      {grant.projectRoleName}
                    </Badge>
                  )}
                  {manageGrants ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRemoveAccess(grant.userId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={shareOpen}
        onClose={() => {
          if (!sharing) {
            setShareOpen(false);
            setActionError(null);
          }
        }}
        title="Share project"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={sharing}
              onClick={() => setShareOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={sharing || !shareEmail.trim()}
              onClick={() => void handleShare()}
            >
              {sharing ? "Sharing…" : "Grant access"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Enter the email of someone who already has an EvoCRM account. They get access right away.
          </p>
          <div>
            <Label htmlFor="share-email">Email address</Label>
            <Input
              id="share-email"
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="teammate@company.com"
              autoFocus
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="share-role">Project role</Label>
            <select
              id="share-role"
              value={shareRole}
              onChange={(e) => setShareRole(e.target.value as ProjectRoleKey)}
              className="w-full h-10 rounded-md border border-[var(--color-line)] px-3 text-[13.5px] bg-white"
            >
              {roleOptions.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name} — {role.description}
                </option>
              ))}
            </select>
          </div>
          {actionError ? (
            <p className="text-[12.5px] text-[var(--color-danger-fg)]">{actionError}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
