"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus, IconMail } from "@/lib/icons";
import { PROJECT_ROLE_DISPLAY_DEFINITIONS } from "@/lib/project-sharing-roles";

type GrantItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  projectRole: string;
  projectRoleName: string;
  status: string;
  createdAt: string;
};

type InvitationItem = {
  id: string;
  email: string;
  projectRole: string;
  projectRoleName: string;
  status: string;
  invitedByName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastResentAt: string | null;
  createdAt: string;
};

type SharingData = {
  grants: GrantItem[];
  invitations: InvitationItem[];
};

type ProjectSharingPanelProps = {
  workspaceSlug: string;
  projectId: string;
  canManage: boolean;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ROLE_OPTIONS = PROJECT_ROLE_DISPLAY_DEFINITIONS.map((r) => ({
  key: r.key,
  name: r.name,
  description: r.description,
}));

export function ProjectSharingPanel({
  workspaceSlug,
  projectId,
  canManage,
}: ProjectSharingPanelProps) {
  const [data, setData] = useState<SharingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteSending, setInviteSending] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}/projects/${projectId}/sharing`;

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

  async function handleSendInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    setActionError(null);

    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          projectRole: inviteRole,
          message: inviteMessage.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload.error?.message ?? "Failed to send invitation.");
        return;
      }

      setInviteOpen(false);
      setInviteEmail("");
      setInviteMessage("");
      await loadData();
    } catch {
      setActionError("Failed to send invitation.");
    } finally {
      setInviteSending(false);
    }
  }

  async function handleChangeRole(userId: string, projectRole: string) {
    setActionError(null);
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

  async function handleInvitationAction(invitationId: string, action: "resend" | "revoke") {
    setActionError(null);
    const response = await fetch(`${apiBase}/invitations/${invitationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const body = await response.json();
      setActionError(body.error?.message ?? `Failed to ${action} invitation.`);
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
  const invitations = data?.invitations ?? [];
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">People & access</h3>
          {canManage ? (
            <Button
              size="sm"
              leadingIcon={<IconPlus size={14} />}
              onClick={() => setInviteOpen(true)}
            >
              Share
            </Button>
          ) : null}
        </div>

        {actionError ? (
          <p className="text-[12.5px] text-[var(--color-danger-fg)] mb-3">{actionError}</p>
        ) : null}

        {grants.length === 0 && pendingInvitations.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ink-muted)] py-4 text-center">
            No collaborators yet. Use Share to invite someone.
          </p>
        ) : null}

        {grants.length > 0 ? (
          <div className="space-y-2 mb-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
              Active collaborators
            </p>
            {grants.map((grant) => (
              <div key={grant.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)] truncate">
                    {grant.userName ?? grant.userEmail}
                  </p>
                  {grant.userName ? (
                    <p className="text-[12px] text-[var(--color-ink-muted)] truncate">{grant.userEmail}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage ? (
                    <select
                      value={grant.projectRole}
                      onChange={(e) => void handleChangeRole(grant.userId, e.target.value)}
                      className="h-7 rounded-md border border-[var(--color-line)] px-2 text-[12px] bg-white"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.key} value={role.key}>{role.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="muted" size="sm">{grant.projectRoleName}</Badge>
                  )}
                  {canManage ? (
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
        ) : null}

        {pendingInvitations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
              Pending invitations
            </p>
            {pendingInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-line)] last:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)] truncate">
                    <IconMail size={13} className="inline mr-1.5 text-[var(--color-ink-muted)]" />
                    {inv.email}
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    {inv.projectRoleName} · Expires {formatWhen(inv.expiresAt)}
                    {inv.invitedByName ? ` · by ${inv.invitedByName}` : null}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => void handleInvitationAction(inv.id, "resend")}>
                      Resend
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleInvitationAction(inv.id, "revoke")}>
                      Revoke
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => {
          if (!inviteSending) {
            setInviteOpen(false);
            setActionError(null);
          }
        }}
        title="Share project"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={inviteSending} onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={inviteSending || !inviteEmail.trim()}
              onClick={() => void handleSendInvite()}
            >
              {inviteSending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="collaborator@example.com"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="invite-role">Project role</Label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full h-10 rounded-md border border-[var(--color-line)] px-3 text-[13.5px] bg-white"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name} — {role.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="invite-message">Personal message (optional)</Label>
            <Input
              id="invite-message"
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Looking forward to working together!"
              maxLength={500}
            />
          </div>
          {actionError ? (
            <p className="text-[12.5px] text-[var(--color-danger-fg)]">{actionError}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
