import { GrowthCampaignOverviewPanel } from "@/components/advertising/growth-campaign-overview-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "Paid ads — Project — EvoHome CRM" };

export default async function ProjectPaidAdsPage({ params }: { params: Params }) {
  const { workspaceSlug, projectId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (!isAdvertisingEnabled()) {
    return (
      <PageContainer>
        <PageHeader title="Paid ads" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Paid ads tools are turned off for now.
        </p>
      </PageContainer>
    );
  }

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Paid ads" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this project’s paid ads.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Paid ads"
        description="Read-only Meta campaigns for this project."
        back={{
          href: `/w/${workspaceSlug}/projects/${projectId}`,
          label: "Project",
        }}
      />
      <GrowthCampaignOverviewPanel
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
    </PageContainer>
  );
}
