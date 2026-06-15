import { ProjectsPanel } from "@/components/projects/projects-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Projects — EvoHome CRM" };

export default async function ProjectsPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view projects.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <ProjectsPanel
        workspaceSlug={workspaceSlug}
        canCreate={hasPermission(permissions, "project:create")}
        canUpdate={hasPermission(permissions, "project:update")}
        canArchive={hasPermission(permissions, "project:archive")}
      />
    </PageContainer>
  );
}
