"use client";

import { useCallback, useEffect, useState } from "react";

import { ReassignmentModal } from "@/components/settings/reassignment-modal";
import { AvatarWithName } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";

type MembershipRecord = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  roleId: string;
  roleName: string;
  roleKey: string;
  isOwnerRole: boolean;
  status: string;
};

type RoleOption = { id: string; name: string; key: string };

type UsersPanelProps = {
  workspaceSlug: string;
  canManage: boolean;
};

export function UsersPanel({ workspaceSlug, canManage }: UsersPanelProps) {
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRoleId, setAddRoleId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [reassignmentTarget, setReassignmentTarget] = useState<MembershipRecord | null>(null);
  const [pendingStatus, setPendingStatus] = useState<"suspended" | "removed" | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set("status", statusFilter);
      }

      const [membersResponse, rolesResponse] = await Promise.all([
        fetch(`${apiBase}/memberships${params.size ? `?${params}` : ""}`),
        fetch(`${apiBase}/roles`),
      ]);

      const membersPayload = await membersResponse.json();
      const rolesPayload = await rolesResponse.json();

      if (membersResponse.status === 403) {
        setForbidden(true);
        return;
      }
      if (!membersResponse.ok) {
        throw new Error(membersPayload.error?.message ?? "Failed to load members.");
      }

      setMemberships(membersPayload.data.memberships as MembershipRecord[]);

      if (rolesResponse.ok) {
        const roleList = rolesPayload.data.roles as RoleOption[];
        setRoles(roleList);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!addRoleId && roles.length > 0) {
      const agentRole = roles.find((role) => role.key === "agent");
      setAddRoleId(agentRole?.id ?? roles[0]!.id);
    }
  }, [addRoleId, roles]);

  async function handleRoleChange(membershipId: string, roleId: string) {
    setActionError(null);
    const response = await fetch(`${apiBase}/memberships/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setActionError(payload.error?.message ?? "Failed to update role.");
      return;
    }

    await loadData();
  }

  async function handleStatusChange(
    membership: MembershipRecord,
    status: "suspended" | "removed",
  ) {
    setActionError(null);

    const summaryResponse = await fetch(
      `${apiBase}/memberships/${membership.id}/reassignment-summary`,
    );
    const summaryPayload = await summaryResponse.json();

    if (summaryResponse.ok && summaryPayload.data.requiresReassignment) {
      setReassignmentTarget(membership);
      setPendingStatus(status);
      return;
    }

    const response = await fetch(`${apiBase}/memberships/${membership.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();

    if (!response.ok) {
      if (response.status === 409 && payload.error?.details?.counts) {
        setReassignmentTarget(membership);
        setPendingStatus(status);
        return;
      }
      setActionError(payload.error?.message ?? "Failed to update member.");
      return;
    }

    await loadData();
  }

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);

    const response = await fetch(`${apiBase}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addEmail, roleId: addRoleId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setActionError(payload.error?.message ?? "Failed to add member.");
      return;
    }

    setAddEmail("");
    setShowAddForm(false);
    await loadData();
  }

  if (forbidden) {
    return <PermissionDenied title="Members unavailable" description="You do not have permission to view members." />;
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
        title="Could not load members"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadData() }}
      />
    );
  }

  const activeMembers = memberships.filter((member) => member.status === "active");

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-lg border border-[var(--color-line)] px-2 text-[12.5px] bg-white"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
              <option value="removed">Removed</option>
            </select>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setShowAddForm((value) => !value)}>
              Add member
            </Button>
          )}
        </div>

        {showAddForm && canManage && (
          <form
            onSubmit={(event) => void handleAddMember(event)}
            className="px-5 py-4 border-b border-[var(--color-line)] bg-[var(--color-canvas)] space-y-3"
          >
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              Adds an existing user by email. Email invitation delivery is not implemented yet.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                type="email"
                placeholder="user@example.com"
                value={addEmail}
                onChange={(event) => setAddEmail(event.target.value)}
                required
              />
              <select
                className="h-9 rounded-lg border border-[var(--color-line)] px-3 text-[13px] bg-white"
                value={addRoleId}
                onChange={(event) => setAddRoleId(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                Add to workspace
              </Button>
            </div>
          </form>
        )}

        {actionError && (
          <p className="px-5 py-3 text-[12.5px] text-[var(--color-danger)] border-b border-[var(--color-line)]">
            {actionError}
          </p>
        )}

        {memberships.length === 0 ? (
          <EmptyState title="No members" description="No memberships match this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Member</th>
                  <th className="text-left font-semibold px-2 py-3">Role</th>
                  <th className="text-left font-semibold px-2 py-3">Status</th>
                  {canManage && <th className="text-right font-semibold px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {memberships.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--color-canvas)]">
                    <td className="px-5 py-3">
                      <AvatarWithName
                        user={{
                          id: member.userId,
                          name: member.name ?? member.email,
                          initials: (member.name ?? member.email)
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase(),
                        }}
                        size={26}
                      />
                      <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                        {member.email}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      {canManage && member.status === "active" && !member.isOwnerRole ? (
                        <select
                          className="h-8 rounded-lg border border-[var(--color-line)] px-2 text-[12.5px] bg-white"
                          value={member.roleId}
                          onChange={(event) =>
                            void handleRoleChange(member.id, event.target.value)
                          }
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={member.isOwnerRole ? "info" : "muted"} size="sm">
                          {member.roleName}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge
                        status={
                          member.status === "active"
                            ? "Active"
                            : member.status === "invited"
                              ? "Pending"
                              : member.status === "suspended"
                                ? "Suspended"
                                : "Removed"
                        }
                        size="sm"
                      />
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        {member.status === "active" && !member.isOwnerRole && (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleStatusChange(member, "suspended")}
                            >
                              Suspend
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleStatusChange(member, "removed")}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                        {member.isOwnerRole && (
                          <span className="text-[12px] text-[var(--color-ink-muted)]">
                            Owner protected
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reassignmentTarget && pendingStatus && (
        <ReassignmentModal
          workspaceSlug={workspaceSlug}
          membership={reassignmentTarget}
          newStatus={pendingStatus}
          activeMembers={activeMembers.filter(
            (member) => member.userId !== reassignmentTarget.userId,
          )}
          onClose={() => {
            setReassignmentTarget(null);
            setPendingStatus(null);
          }}
          onComplete={() => {
            setReassignmentTarget(null);
            setPendingStatus(null);
            void loadData();
          }}
        />
      )}
    </>
  );
}
