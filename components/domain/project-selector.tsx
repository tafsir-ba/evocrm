"use client";

import { useMemo, useState } from "react";

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
  searchable?: boolean;
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
  searchable,
}: ProjectSelectorProps) {
  const [query, setQuery] = useState("");
  const showSearch = searchable ?? projects.length >= 8;
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return projects;
    }
    return projects.filter((project) => {
      const haystack = [project.name, project.reference, project.city, project.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [projects, query]);
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
    <div className={cn("space-y-1.5", className)}>
      {showSearch ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          disabled={disabled}
          className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring"
        />
      ) : null}
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
        )}
      >
        <option value="">{placeholder}</option>
        {visibleProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {formatProjectLabel(project)}
          </option>
        ))}
      </select>
    </div>
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
