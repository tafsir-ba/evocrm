"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { withProjectIdQuery } from "@/lib/project-scope";
import { workspaceNavPath, workspacePath } from "@/lib/workspace-paths";

type ProjectDetail = {
  id: string;
  name: string;
  reference: string | null;
  projectType: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  archivedAt: string | null;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "leads", label: "Leads", href: "leads" },
  { key: "properties", label: "Properties", href: "properties" },
  { key: "pipeline", label: "Pipeline", href: "pipeline" },
  { key: "activities", label: "Activities", href: "activities" },
  { key: "dripping", label: "Dripping", href: "dripping" },
  { key: "settings", label: "Settings", href: "edit" },
] as const;

type ProjectDetailPanelProps = {
  workspaceSlug: string;
  projectId: string;
  canUpdate: boolean;
  canArchive: boolean;
};

export function ProjectDetailPanel({
  workspaceSlug,
  projectId,
  canUpdate,
  canArchive,
}: ProjectDetailPanelProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load project.");
      }
      setProject(payload.data.project as ProjectDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function archiveProject() {
    if (!project || !canArchive) return;
    const confirmed = window.confirm(`Archive "${project.name}"?`);
    if (!confirmed) return;

    const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "Failed to archive project.");
      return;
    }
    await loadProject();
  }

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error || !project) {
    return (
      <ErrorState
        title="Could not load project"
        description={error ?? "Project not found."}
        primaryAction={{ label: "Retry", onClick: () => void loadProject() }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.reference ? `Reference ${project.reference}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {canUpdate && !project.archivedAt && (
              <Link
                href={workspacePath(workspaceSlug, "projects", projectId, "edit")}
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
              >
                Edit
              </Link>
            )}
            {canArchive && !project.archivedAt && (
              <Button variant="danger" onClick={() => void archiveProject()}>
                Archive
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((tab) => {
          if (tab.key === "overview") {
            return (
              <span
                key={tab.key}
                className="px-3 py-1.5 rounded-md bg-[var(--color-brand-50)] text-[var(--color-brand-700)] text-[13px] font-medium"
              >
                {tab.label}
              </span>
            );
          }

          const baseHref =
            tab.href === "edit"
              ? workspacePath(workspaceSlug, "projects", projectId, "edit")
              : withProjectIdQuery(workspaceNavPath(workspaceSlug, tab.href!), projectId);

          return (
            <Link
              key={tab.key}
              href={baseHref}
              className="px-3 py-1.5 rounded-md border border-[var(--color-line)] bg-white text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          {project.archivedAt ? (
            <Badge tone="muted">Archived</Badge>
          ) : (
            <Badge tone="success">Active</Badge>
          )}
          {project.projectType && <Badge tone="muted">{project.projectType}</Badge>}
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-[var(--color-ink-muted)]">Location</dt>
            <dd className="text-[var(--color-ink)]">
              {[project.address, project.city, project.country].filter(Boolean).join(", ") ||
                "—"}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-[var(--color-ink-muted)]">Description</dt>
            <dd className="text-[var(--color-ink)] whitespace-pre-wrap">
              {project.description || "—"}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
