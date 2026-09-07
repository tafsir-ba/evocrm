import { ProjectSharingPanel } from "@/components/projects/project-sharing-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { findProjectById } from "@/server/repositories/projects";
import { AppError } from "@/server/errors";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "Share project — EvoHome CRM" };

export default async function ProjectSharingPage({ params }: { params: Params }) {
  if (!PROJECT_SHARING_ENABLED) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Project sharing is currently unavailable.
        </p>
      </PageContainer>
    );
  }

  const { workspaceSlug, projectId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this project.
        </p>
      </PageContainer>
    );
  }

  try {
    const project = await findProjectById(access.context.workspace.id, projectId);
    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found.");
    }

    const projectAccess = await requireProjectAccess(
      access.context.workspace.id,
      access.user.id,
      projectId,
    );

    const canManageGrants =
      projectAccess.projectRole === "project_admin" || projectAccess.isWorkspaceAdmin;

    return (
      <PageContainer>
        <PageHeader
          title="Share project"
          description={project.name}
        />
        <div className="mt-6">
          <ProjectSharingPanel
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            canShare
            canManageGrants={canManageGrants}
            actorProjectRole={projectAccess.projectRole}
          />
        </div>
      </PageContainer>
    );
  } catch {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have access to this project.
        </p>
      </PageContainer>
    );
  }
}
