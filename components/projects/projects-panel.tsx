"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectsTable } from "@/components/projects/projects-table";
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

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div className="max-w-xs flex-1 min-w-[200px]">
          <Input
            placeholder="Search projects…"
            aria-label="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fieldSize="sm"
          />
        </div>
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
        <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
          <ProjectsTable
            workspaceSlug={workspaceSlug}
            projects={visibleProjects}
            canUpdate={canUpdate}
            canArchive={canArchive}
            onArchive={(projectId, projectName) => void archiveProject(projectId, projectName)}
          />
        </div>
      )}
    </>
  );
}
