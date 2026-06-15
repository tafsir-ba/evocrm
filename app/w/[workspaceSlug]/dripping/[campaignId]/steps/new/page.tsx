import { CampaignStepFormPage } from "@/components/campaigns/campaign-step-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string }>;

export const metadata = { title: "Add step — EvoHome CRM" };

export default async function NewCampaignStepPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (
    access.permissionDenied ||
    !hasPermission(access.context.membership.role.permissions, "campaign:update")
  ) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to add campaign steps.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <CampaignStepFormPage workspaceSlug={workspaceSlug} campaignId={campaignId} />
    </PageContainer>
  );
}
