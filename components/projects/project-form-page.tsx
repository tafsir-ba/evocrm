"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { workspacePath } from "@/lib/workspace-paths";

const PROJECT_TYPES = [
  { value: "", label: "Select type…" },
  { value: "development", label: "Development" },
  { value: "resale_mandate", label: "Resale mandate" },
  { value: "rental_project", label: "Rental project" },
  { value: "other", label: "Other" },
] as const;

type ProjectFormState = {
  name: string;
  reference: string;
  projectType: string;
  address: string;
  city: string;
  country: string;
  description: string;
};

const emptyForm: ProjectFormState = {
  name: "",
  reference: "",
  projectType: "",
  address: "",
  city: "",
  country: "",
  description: "",
};

type ProjectFormPageProps = {
  workspaceSlug: string;
  mode: "create" | "edit";
  projectId?: string;
};

export function ProjectFormPage({ workspaceSlug, mode, projectId }: ProjectFormPageProps) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectFormState>(emptyForm);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const isEdit = mode === "edit" && projectId;
  const cancelHref = isEdit
    ? workspacePath(workspaceSlug, "projects", projectId)
    : workspacePath(workspaceSlug, "projects");

  const loadProject = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load project.");
      }
      const project = payload.data.project as {
        name: string;
        reference: string | null;
        projectType: string | null;
        address: string | null;
        city: string | null;
        country: string | null;
        description: string | null;
      };
      setForm({
        name: project.name,
        reference: project.reference ?? "",
        projectType: project.projectType ?? "",
        address: project.address ?? "",
        city: project.city ?? "",
        country: project.country ?? "",
        description: project.description ?? "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, isEdit, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      name: form.name.trim(),
      reference: form.reference.trim() || undefined,
      projectType: form.projectType || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      country: form.country.trim() || undefined,
      description: form.description.trim() || undefined,
    };

    const response = await fetch(
      isEdit ? `${apiBase}/projects/${projectId}` : `${apiBase}/projects`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                ...body,
                reference: form.reference.trim() || null,
                projectType: form.projectType || null,
                address: form.address.trim() || null,
                city: form.city.trim() || null,
                country: form.country.trim() || null,
                description: form.description.trim() || null,
              }
            : body,
        ),
      },
    );

    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to save project.");
      return;
    }

    const savedId = isEdit ? projectId : (payload.data.project.id as string);
    router.push(workspacePath(workspaceSlug, "projects", savedId));
    router.refresh();
  }

  const formId = "project-form";

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit project" : "New project"}
      description="Projects scope CRM data across leads, properties, pipeline, and dripping."
      back={{ href: cancelHref, label: "Projects" }}
    >
      {loading ? (
        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
      ) : (
      <form id={formId} onSubmit={onSubmit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              value={form.reference}
              onChange={(event) => setForm((c) => ({ ...c, reference: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="projectType">Project type</Label>
            <Select
              id="projectType"
              value={form.projectType}
              onChange={(event) => setForm((c) => ({ ...c, projectType: event.target.value }))}
            >
              {PROJECT_TYPES.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) => setForm((c) => ({ ...c, city: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={form.country}
              onChange={(event) => setForm((c) => ({ ...c, country: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            />
          </div>
        </div>

        <FocusedFormActions
          cancelHref={cancelHref}
          formId={formId}
          submitLabel={isEdit ? "Save project" : "Create project"}
          submitting={saving}
        />
      </form>
      )}
      {error ? (
        <p className="mt-3 text-[13px] text-[var(--color-danger-fg)]">{error}</p>
      ) : null}
    </FocusedFormLayout>
  );
}
