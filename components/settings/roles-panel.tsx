"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";

type RoleRecord = {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
};

type PermissionGroup = {
  module: string;
  permissions: { key: string; label: string }[];
};

type RolesPanelProps = {
  workspaceSlug: string;
  canManage: boolean;
};

export function RolesPanel({ workspaceSlug, canManage }: RolesPanelProps) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [formName, setFormName] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`${apiBase}/roles`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load roles.");
      }

      setRoles(payload.data.roles as RoleRecord[]);
      setPermissionGroups(payload.data.permissionGroups as PermissionGroup[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  function resetForm() {
    setShowForm(false);
    setEditingRole(null);
    setFormName("");
    setFormKey("");
    setFormPermissions([]);
    setActionError(null);
  }

  function startCreate() {
    setEditingRole(null);
    setFormName("");
    setFormKey("");
    setFormPermissions(["dashboard:read", "lead:read"]);
    setShowForm(true);
  }

  function startEdit(role: RoleRecord) {
    setEditingRole(role);
    setFormName(role.name);
    setFormKey(role.key);
    setFormPermissions(role.permissions);
    setShowForm(true);
  }

  function togglePermission(key: string) {
    setFormPermissions((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);

    const body = editingRole
      ? { name: formName, permissions: formPermissions }
      : { name: formName, key: formKey, permissions: formPermissions };

    const response = await fetch(
      editingRole ? `${apiBase}/roles/${editingRole.id}` : `${apiBase}/roles`,
      {
        method: editingRole ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setActionError(payload.error?.message ?? "Failed to save role.");
      return;
    }

    resetForm();
    await loadRoles();
  }

  async function handleDelete(role: RoleRecord) {
    setActionError(null);
    const response = await fetch(`${apiBase}/roles/${role.id}`, { method: "DELETE" });
    const payload = await response.json();

    if (!response.ok) {
      setActionError(payload.error?.message ?? "Failed to delete role.");
      return;
    }

    await loadRoles();
  }

  if (forbidden) {
    return <PermissionDenied title="Roles unavailable" description="You do not have permission to view roles." />;
  }

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-8 w-full mb-2" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load roles"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadRoles() }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={startCreate}>
            Create custom role
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">
              {editingRole ? `Edit ${editingRole.name}` : "New custom role"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="Role name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                required
              />
              {!editingRole && (
                <Input
                  placeholder="role_key"
                  value={formKey}
                  onChange={(event) => setFormKey(event.target.value)}
                  required
                />
              )}
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {permissionGroups.map((group) => (
                <div key={group.module}>
                  <p className="text-[12px] font-semibold uppercase text-[var(--color-ink-muted)] mb-1">
                    {group.module}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.key}
                        className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink-soft)]"
                      >
                        <input
                          type="checkbox"
                          checked={formPermissions.includes(permission.key)}
                          onChange={() => togglePermission(permission.key)}
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {actionError && (
              <p className="text-[12.5px] text-[var(--color-danger)]">{actionError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                {editingRole ? "Save role" : "Create role"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {actionError && !showForm && (
        <p className="text-[12.5px] text-[var(--color-danger)]">{actionError}</p>
      )}

      {roles.length === 0 ? (
        <EmptyState title="No roles" description="No roles found for this workspace." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roles.map((role) => (
            <Card key={role.id} className="!p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-ink)]">{role.name}</p>
                  <p className="text-[12px] text-[var(--color-ink-muted)]">{role.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  {role.isSystem && (
                    <Badge tone="muted" size="sm">
                      System
                    </Badge>
                  )}
                  <Badge tone="info" size="sm">
                    {role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
              <p className="text-[12px] text-[var(--color-ink-muted)] mb-3">
                {role.permissions.length} permissions
              </p>
              {canManage && !role.isSystem && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => startEdit(role)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void handleDelete(role)}>
                    Delete
                  </Button>
                </div>
              )}
              {role.isSystem && (
                <p className="text-[12px] text-[var(--color-ink-muted)]">Read-only system role</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
