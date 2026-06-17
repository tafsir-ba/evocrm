import { PropertiesPanel } from "@/components/properties/properties-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Properties — EvoHome CRM" };

export default async function PropertiesPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view properties.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <PropertiesPanel
        workspaceSlug={workspaceSlug}
        defaultCurrency={access.context.workspace.defaultCurrency}
        canCreate={hasPermission(permissions, "property:create")}
        canCreateProject={hasPermission(permissions, "project:create")}
        canArchive={hasPermission(permissions, "property:archive")}
      />
    </PageContainer>
  );
}
