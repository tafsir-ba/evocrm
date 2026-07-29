"use client";

import { cn } from "@/lib/utils";

export type ProjectSelectorProject = {
  id: string;
  name: string;
  reference?: string | null;
  city?: string | null;
  country?: string | null;
};

export type ProjectSelectorProps = {
  projects: ProjectSelectorProject[];
  selectedProjectId?: string | null;
  onChange?: (projectId: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  className?: string;
  id?: string;
  name?: string;
};

export function ProjectSelector({
  projects,
  selectedProjectId = null,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "No project selected",
  emptyLabel = "No projects available",
  loadingLabel = "Loading projects…",
  className,
  id,
  name,
}: ProjectSelectorProps) {
  if (loading && projects.length === 0) {
    return (
      <p className={cn("text-[12.5px] text-[var(--color-ink-muted)]", className)}>
        {loadingLabel}
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className={cn("text-[12.5px] text-[var(--color-ink-muted)]", className)}>
        {emptyLabel}
      </p>
    );
  }

  if (!onChange) {
    const selected = projects.find((project) => project.id === selectedProjectId);

    return (
      <p className={cn("text-[13px] text-[var(--color-ink)]", className)}>
        {selected ? formatProjectLabel(selected) : placeholder}
      </p>
    );
  }

  return (
    <select
      id={id}
      name={name}
      value={selectedProjectId ?? ""}
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        onChange(value === "" ? null : value);
      }}
      className={cn(
        "w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {formatProjectLabel(project)}
        </option>
      ))}
    </select>
  );
}

function formatProjectLabel(project: ProjectSelectorProject): string {
  const location = [project.city, project.country].filter(Boolean).join(", ");
  const reference = project.reference ? ` (${project.reference})` : "";

  if (location) {
    return `${project.name}${reference} — ${location}`;
  }

  return `${project.name}${reference}`;
}
