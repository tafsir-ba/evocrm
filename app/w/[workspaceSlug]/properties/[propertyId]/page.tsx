import { PropertyDetailPanel } from "@/components/properties/property-detail-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; propertyId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug, propertyId } = await params;
  return { title: `Property ${propertyId} — ${workspaceSlug}` };
}

export default async function PropertyDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, propertyId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this property.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <PropertyDetailPanel
        workspaceSlug={workspaceSlug}
        propertyId={propertyId}
        defaultCurrency={access.context.workspace.defaultCurrency}
        canUpdate={hasPermission(permissions, "property:update")}
        canArchive={hasPermission(permissions, "property:archive")}
      />
    </PageContainer>
  );
}
