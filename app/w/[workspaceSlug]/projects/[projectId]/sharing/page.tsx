import { ProjectSharingPanel } from "@/components/projects/project-sharing-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "People & access — EvoHome CRM" };

export default async function ProjectSharingPage({ params }: { params: Params }) {
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

  const permissions = access.context.membership.role.permissions;
  const canManage =
    hasPermission(permissions, "project:update") ||
    hasPermission(permissions, "users:manage");

  return (
    <PageContainer>
      <ProjectSharingPanel
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        canManage={canManage}
      />
    </PageContainer>
  );
}
