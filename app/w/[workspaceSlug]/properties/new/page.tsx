import {
  PropertyFormPage,
} from "@/components/properties/property-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "New property — EvoHome CRM" };

export default async function NewPropertyPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to view properties."
        />
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "property:create")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to create properties."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PropertyFormPage
        workspaceSlug={workspaceSlug}
        defaultCurrency={access.context.workspace.defaultCurrency}
        mode="create"
        canCreateDocument={hasPermission(permissions, "document:create")}
        cancelHref={workspacePath(workspaceSlug, "properties")}
        back={{ href: workspacePath(workspaceSlug, "properties"), label: "Back to properties" }}
      />
    </PageContainer>
  );
}
