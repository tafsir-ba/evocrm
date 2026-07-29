import { ProjectSharingPanel } from "@/components/projects/project-sharing-panel";
import { PageContainer } from "@/components/layout/page-header";
import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "People & access — EvoHome CRM" };

export default async function ProjectSharingPage({ params }: { params: Params }) {
  if (!PROJECT_SHARING_ENABLED) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Project sharing is temporarily unavailable until project-scoped authorization is fully enforced.
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
