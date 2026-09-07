import { ProjectDetailPanel } from "@/components/projects/project-detail-panel";
import { PageContainer } from "@/components/layout/page-header";
import { AppError } from "@/server/errors";
import { hasPermission } from "@/server/permissions/permissions";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "Project — EvoHome CRM" };

export default async function ProjectDetailPage({ params }: { params: Params }) {
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
    await requireProjectAccess(
      access.context.workspace.id,
      access.user.id,
      projectId,
      "project:read",
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      return (
        <PageContainer>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            You do not have access to this project.
          </p>
        </PageContainer>
      );
    }
    throw error;
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <ProjectDetailPanel
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        canUpdate={hasPermission(permissions, "project:update")}
        canArchive={hasPermission(permissions, "project:archive")}
      />
    </PageContainer>
  );
}
