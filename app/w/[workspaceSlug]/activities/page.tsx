import { ActivitiesPanel } from "@/components/activities/activities-panel";
import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Activities — EvoHome CRM" };

export default async function ActivitiesPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view activities.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <ProjectFilterSuspense>
        <ActivitiesPanel
          workspaceSlug={workspaceSlug}
          workspaceTimezone={access.context.workspace.timezone}
          canCreate={hasPermission(permissions, "activity:create")}
          canUpdate={hasPermission(permissions, "activity:update")}
          canArchive={hasPermission(permissions, "activity:archive")}
          allowGlobalCreate={false}
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
