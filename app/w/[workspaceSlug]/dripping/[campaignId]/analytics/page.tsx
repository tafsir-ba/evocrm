import { CampaignAnalyticsPanel } from "@/components/campaigns/campaign-analytics-panel";
import { PageContainer } from "@/components/layout/page-header";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string }>;

export const metadata = { title: "Campaign analytics — EvoHome CRM" };

export default async function CampaignAnalyticsPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view campaign analytics.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="min-w-0 overflow-x-hidden">
      <CampaignAnalyticsPanel
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
      />
    </PageContainer>
  );
}
