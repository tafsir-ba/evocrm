"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type ProjectRecord = {
  id: string;
  name: string;
  reference: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  assignedTo: string | null;
  archivedAt: string | null;
  createdAt: string;
};

type ProjectFormState = {
  name: string;
  reference: string;
  address: string;
  city: string;
  country: string;
  description: string;
};

const emptyForm: ProjectFormState = {
  name: "",
  reference: "",
  address: "",
  city: "",
  country: "",
  description: "",
};

type ProjectsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

export function ProjectsPanel({ workspaceSlug, canUpdate }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectFormState>(emptyForm);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams();
      if (includeArchived) {
        params.set("includeArchived", "true");
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const query = params.toString();
      const response = await fetch(
        `${apiBase}/projects${query ? `?${query}` : ""}`,
      );
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load projects.");
      }

      setProjects(payload.data.projects as ProjectRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, includeArchived, search]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const visibleProjects = useMemo(
    () => projects.filter((project) => includeArchived || !project.archivedAt),
    [projects, includeArchived],
  );

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(project: ProjectRecord) {
    setShowForm(false);
    setEditingId(project.id);
    setForm({
      name: project.name,
      reference: project.reference ?? "",
      address: project.address ?? "",
      city: project.city ?? "",
      country: project.country ?? "",
      description: project.description ?? "",
    });
  }

  function buildCreatePayload(formState: ProjectFormState) {
    return {
      name: formState.name,
      reference: formState.reference.trim() || undefined,
      address: formState.address.trim() || undefined,
      city: formState.city.trim() || undefined,
      country: formState.country.trim() || undefined,
      description: formState.description.trim() || undefined,
    };
  }

  function buildUpdatePayload(formState: ProjectFormState) {
    return {
      name: formState.name,
      reference: formState.reference.trim() || null,
      address: formState.address.trim() || null,
      city: formState.city.trim() || null,
      country: formState.country.trim() || null,
      description: formState.description.trim() || null,
    };
  }

  async function createProject() {
    const response = await fetch(`${apiBase}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCreatePayload(form)),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to create project.");
      return;
    }

    resetForm();
    await loadProjects();
  }

  async function saveProject(projectId: string) {
    const response = await fetch(`${apiBase}/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildUpdatePayload(form)),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to update project.");
      return;
    }

    resetForm();
    await loadProjects();
  }

  async function archiveProject(projectId: string, projectName: string) {
    const confirmed = window.confirm(
      `Archive "${projectName}"? Archived projects are hidden from selectors but remain linked to existing properties.`,
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`${apiBase}/projects/${projectId}`, {
      method: "DELETE",
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to archive project.");
      return;
    }

    if (editingId === projectId) {
      resetForm();
    }

    await loadProjects();
  }

  function renderForm(title: string, onSubmit: () => void, submitLabel: string) {
    return (
      <Card>
        <p className="text-[13px] font-medium text-[var(--color-ink)] mb-3">{title}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Reference">
            <Input
              value={form.reference}
              onChange={(event) =>
                setForm((current) => ({ ...current, reference: event.target.value }))
              }
              placeholder="GV"
            />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <Input
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(event) =>
                setForm((current) => ({ ...current, country: event.target.value }))
              }
            />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring"
            />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={() => void onSubmit()} disabled={!form.name.trim()}>
            {submitLabel}
          </Button>
          <Button size="sm" variant="secondary" onClick={resetForm}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  if (forbidden) {
    return <PermissionDenied title="Projects unavailable" />;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && projects.length === 0) {
    return <ErrorState title="Could not load projects" description={error} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, reference, or city"
              className="max-w-sm"
            />
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)] whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Show archived
            </label>
          </div>
          {canUpdate && (
            <Button size="sm" onClick={() => (showForm ? resetForm() : startCreate())}>
              {showForm ? "Cancel" : "+ Create project"}
            </Button>
          )}
        </div>
      </Card>

      {canUpdate && showForm && renderForm("New project", createProject, "Create project")}

      {canUpdate && editingId && renderForm("Edit project", () => saveProject(editingId), "Save changes")}

      {visibleProjects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create projects to group properties by development or location."
        />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-2 py-3">Reference</th>
                  <th className="text-left font-semibold px-2 py-3">City</th>
                  <th className="text-left font-semibold px-2 py-3">Country</th>
                  <th className="text-left font-semibold px-2 py-3">Assigned To</th>
                  <th className="text-left font-semibold px-2 py-3">Created</th>
                  <th className="text-left font-semibold px-2 py-3">Status</th>
                  {canUpdate && (
                    <th className="text-right font-semibold px-5 py-3">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {visibleProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-[var(--color-canvas)]">
                    <td className="px-5 py-3 font-medium text-[var(--color-ink)]">
                      {project.name}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {project.reference ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {project.city ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {project.country ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)] tabular">
                      {project.assignedTo ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)] tabular">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={project.archivedAt ? "muted" : "info"} size="sm">
                        {project.archivedAt ? "Archived" : "Active"}
                      </Badge>
                    </td>
                    {canUpdate && (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!project.archivedAt && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => startEdit(project)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void archiveProject(project.id, project.name)}
                              >
                                Archive
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {error && (
        <p className="text-[12px] text-[var(--color-danger-fg)]">{error}</p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[12px] text-[var(--color-ink-muted)]">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
