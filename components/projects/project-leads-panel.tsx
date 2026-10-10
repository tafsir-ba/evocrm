"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LeadsPanel } from "@/components/leads/leads-panel";
import { ProjectSectionNav } from "@/components/projects/project-section-nav";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { workspacePath } from "@/lib/workspace-paths";

type ProjectLeadsPanelProps = {
  workspaceSlug: string;
  projectId: string;
  canCreate: boolean;
  canCreateProject?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canManageStatuses?: boolean;
  canCreateNotes?: boolean;
  canEnrich?: boolean;
  canRequestMarketEstimate?: boolean;
  canUpdateProject?: boolean;
  showPaidAds?: boolean;
};

type ProjectHeader = {
  id: string;
  name: string;
  reference: string | null;
  archivedAt: string | null;
};

export function ProjectLeadsPanel({
  workspaceSlug,
  projectId,
  canCreate,
  canCreateProject = false,
  canArchive,
  canDelete,
  canUpdate,
  canManageStatuses = false,
  canCreateNotes = false,
  canEnrich = false,
  canRequestMarketEstimate = false,
  canUpdateProject = false,
  showPaidAds = false,
}: ProjectLeadsPanelProps) {
  const [project, setProject] = useState<ProjectHeader | null>(null);
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
      const loaded = payload.data.project as ProjectHeader;
      setProject({
        id: loaded.id,
        name: loaded.name,
        reference: loaded.reference ?? null,
        archivedAt: loaded.archivedAt ?? null,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  if (loading) {
    return <Skeleton className="h-28 w-full" />;
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
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectSectionNav
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        projectName={project.name}
        projectReference={project.reference}
        activeTab="leads"
        showPaidAds={showPaidAds}
        actions={
          canUpdateProject && !project.archivedAt ? (
            <Link
              href={workspacePath(workspaceSlug, "projects", projectId, "edit")}
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
            >
              Edit
            </Link>
          ) : undefined
        }
      />
      <LeadsPanel
        workspaceSlug={workspaceSlug}
        canCreate={canCreate}
        canCreateProject={canCreateProject}
        canArchive={canArchive}
        canDelete={canDelete}
        canUpdate={canUpdate}
        canManageStatuses={canManageStatuses}
        canCreateNotes={canCreateNotes}
        canEnrich={canEnrich}
        canRequestMarketEstimate={canRequestMarketEstimate}
        scopedProjectId={projectId}
      />
    </div>
  );
}
