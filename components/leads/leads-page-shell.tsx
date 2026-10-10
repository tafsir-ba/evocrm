"use client";

import { useCallback, useEffect, useState } from "react";

import { LeadsPanel } from "@/components/leads/leads-panel";
import { ProjectSectionNav } from "@/components/projects/project-section-nav";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";

type LeadsPageShellProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canCreateProject?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canManageStatuses?: boolean;
  canCreateNotes?: boolean;
  canEnrich?: boolean;
  canRequestMarketEstimate?: boolean;
  showPaidAds?: boolean;
};

type ProjectHeader = {
  id: string;
  name: string;
  reference: string | null;
};

/**
 * Workspace leads page shell. When a project is selected (URL projectId), keep the
 * project section menu visible above the leads list.
 */
export function LeadsPageShell({
  workspaceSlug,
  canCreate,
  canCreateProject = false,
  canArchive,
  canDelete,
  canUpdate,
  canManageStatuses = false,
  canCreateNotes = false,
  canEnrich = false,
  canRequestMarketEstimate = false,
  showPaidAds = false,
}: LeadsPageShellProps) {
  const projectId = useWorkspaceProjectFilter();
  const [project, setProject] = useState<ProjectHeader | null>(null);

  const loadProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) {
        setProject(null);
        return;
      }
      const loaded = payload.data.project as ProjectHeader;
      setProject({
        id: loaded.id,
        name: loaded.name,
        reference: loaded.reference ?? null,
      });
    } catch {
      setProject(null);
    }
  }, [projectId, workspaceSlug]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {projectId ? (
        <ProjectSectionNav
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          projectName={project?.name ?? "Project"}
          projectReference={project?.reference ?? null}
          activeTab="leads"
          showPaidAds={showPaidAds}
        />
      ) : null}
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
      />
    </div>
  );
}
