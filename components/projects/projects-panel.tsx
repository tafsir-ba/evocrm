"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type ProjectCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activeCampaigns: number;
  lastActivityAt: string | null;
};

type ProjectRecord = {
  id: string;
  name: string;
  reference: string | null;
  city: string | null;
  country: string | null;
  projectType: string | null;
  archivedAt: string | null;
  createdAt: string;
  counts?: ProjectCounts;
};

type ProjectsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

export function ProjectsPanel({
  workspaceSlug,
  canCreate,
  canUpdate,
  canArchive,
}: ProjectsPanelProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({ withCounts: "true" });
      if (includeArchived) params.set("includeArchived", "true");
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`${apiBase}/projects?${params.toString()}`);
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

  async function archiveProject(projectId: string, projectName: string) {
    if (!canArchive) return;
    const confirmed = window.confirm(`Archive "${projectName}"?`);
    if (!confirmed) return;

    const response = await fetch(`${apiBase}/projects/${projectId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to archive project.");
      return;
    }
    await loadProjects();
  }

  if (forbidden) {
    return <PermissionDenied title="Permission denied" />;
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Real estate developments and CRM scopes for this workspace."
        actions={
          canCreate ? (
            <Link
              href={workspacePath(workspaceSlug, "projects", "new")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-brand-600)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--color-brand-700)]"
            >
              <IconPlus size={15} />
              New project
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          placeholder="Search projects…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-soft)]">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <ErrorState
          title="Could not load projects"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadProjects() }}
        />
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to scope leads, properties, pipeline, and dripping."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
          <table className="min-w-full text-[13px]">
            <thead className="bg-[var(--color-canvas)] text-[var(--color-ink-muted)]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Reference</th>
                <th className="text-left px-3 py-2 font-medium">Location</th>
                <th className="text-right px-3 py-2 font-medium">Leads</th>
                <th className="text-right px-3 py-2 font-medium">Properties</th>
                <th className="text-right px-3 py-2 font-medium">Pipeline</th>
                <th className="text-right px-3 py-2 font-medium">Dripping</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr key={project.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">
                    <Link
                      href={workspacePath(workspaceSlug, "projects", project.id)}
                      className="hover:text-[var(--color-brand-600)]"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{project.reference ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {[project.city, project.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">{project.counts?.leads ?? 0}</td>
                  <td className="px-3 py-2.5 text-right">{project.counts?.properties ?? 0}</td>
                  <td className="px-3 py-2.5 text-right">
                    {project.counts?.opportunities ?? 0}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {project.counts?.activeCampaigns ?? 0}
                  </td>
                  <td className="px-3 py-2.5">
                    {project.archivedAt ? (
                      <Badge tone="muted">Archived</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right space-x-2">
                    <Link
                      href={workspacePath(workspaceSlug, "projects", project.id)}
                      className="text-[var(--color-brand-600)] hover:underline"
                    >
                      View
                    </Link>
                    {canUpdate && !project.archivedAt && (
                      <Link
                        href={workspacePath(workspaceSlug, "projects", project.id, "edit")}
                        className="text-[var(--color-brand-600)] hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                    {canArchive && !project.archivedAt && (
                      <button
                        type="button"
                        onClick={() => void archiveProject(project.id, project.name)}
                        className="text-[var(--color-danger-fg)] hover:underline"
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
