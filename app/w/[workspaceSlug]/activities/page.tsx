import { ActivitiesPanel } from "@/components/activities/activities-panel";
import { PageContainer } from "@/components/layout/page-header";
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
      <ActivitiesPanel
        workspaceSlug={workspaceSlug}
        canCreate={hasPermission(permissions, "activity:create")}
        canUpdate={hasPermission(permissions, "activity:update")}
        canArchive={hasPermission(permissions, "activity:archive")}
      />
    </PageContainer>
  );
}
