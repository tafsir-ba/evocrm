import { CampaignsPanel } from "@/components/campaigns/campaigns-panel";
import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Dripping — EvoHome CRM" };

export default async function DrippingPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view dripping campaigns.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <ProjectFilterSuspense>
        <CampaignsPanel
          workspaceSlug={workspaceSlug}
          canCreate={hasPermission(permissions, "campaign:create")}
          canUpdate={hasPermission(permissions, "campaign:update")}
          canArchive={hasPermission(permissions, "campaign:archive")}
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
