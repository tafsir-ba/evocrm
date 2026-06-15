import { CampaignStepFormPage } from "@/components/campaigns/campaign-step-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string; stepId: string }>;

export const metadata = { title: "Edit step — EvoHome CRM" };

export default async function EditCampaignStepPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId, stepId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (
    access.permissionDenied ||
    !hasPermission(access.context.membership.role.permissions, "campaign:update")
  ) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to edit campaign steps.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <CampaignStepFormPage
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        stepId={stepId}
      />
    </PageContainer>
  );
}
