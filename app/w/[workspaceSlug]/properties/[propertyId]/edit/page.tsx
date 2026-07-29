import { PropertyFormPage } from "@/components/properties/property-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { propertyFormValuesFromSqm } from "@/lib/property-form-values";
import { workspacePath } from "@/lib/workspace-paths";
import { hasPermission } from "@/server/permissions/permissions";
import { getPropertyForWorkspace } from "@/server/services/properties";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; propertyId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit property — ${workspaceSlug}` };
}

export default async function EditPropertyPage({ params }: { params: Params }) {
  const { workspaceSlug, propertyId } = await params;
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

  if (!hasPermission(permissions, "property:update")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to edit properties."
        />
      </PageContainer>
    );
  }

  const property = await getPropertyForWorkspace(access.context.workspace.id, propertyId);
  const defaultCurrency = access.context.workspace.defaultCurrency;

  return (
    <PageContainer>
      <ProjectFilterSuspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <PropertyFormPage
          workspaceSlug={workspaceSlug}
          defaultCurrency={defaultCurrency}
          mode="edit"
          propertyId={propertyId}
          canCreateDocument={hasPermission(permissions, "document:create")}
          initialValues={propertyFormValuesFromSqm(property, defaultCurrency)}
          cancelHref={workspacePath(workspaceSlug, "properties", propertyId)}
          back={{
            href: workspacePath(workspaceSlug, "properties", propertyId),
            label: "Back to property",
          }}
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
