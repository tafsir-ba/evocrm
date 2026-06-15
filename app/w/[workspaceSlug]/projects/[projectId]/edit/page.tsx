import { ProjectFormPage } from "@/components/projects/project-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "Edit Project — EvoHome CRM" };

export default async function EditProjectPage({ params }: { params: Params }) {
  const { workspaceSlug, projectId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to edit projects.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "project:update")) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to edit projects.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ProjectFormPage workspaceSlug={workspaceSlug} projectId={projectId} mode="edit" />
    </PageContainer>
  );
}
