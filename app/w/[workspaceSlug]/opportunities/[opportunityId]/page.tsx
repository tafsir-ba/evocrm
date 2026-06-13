import { OpportunityDetailPanel } from "@/components/opportunities/opportunity-detail-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; opportunityId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug, opportunityId } = await params;
  return { title: `Opportunity ${opportunityId} — ${workspaceSlug}` };
}

export default async function OpportunityDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, opportunityId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this opportunity.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <OpportunityDetailPanel
        workspaceSlug={workspaceSlug}
        opportunityId={opportunityId}
        canUpdate={hasPermission(permissions, "opportunity:update")}
        canArchive={hasPermission(permissions, "opportunity:archive")}
      />
    </PageContainer>
  );
}
