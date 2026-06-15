import { CampaignDetailPanel } from "@/components/campaigns/campaign-detail-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string }>;

export const metadata = { title: "Campaign — EvoHome CRM" };

export default async function CampaignDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this campaign.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <CampaignDetailPanel
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        canUpdate={hasPermission(permissions, "campaign:update")}
        canArchive={hasPermission(permissions, "campaign:archive")}
        canDelete={hasPermission(permissions, "campaign:delete")}
      />
    </PageContainer>
  );
}
