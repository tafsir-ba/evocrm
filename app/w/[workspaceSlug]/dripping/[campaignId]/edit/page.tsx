import { CampaignFormPage } from "@/components/campaigns/campaign-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { getCampaignForWorkspace } from "@/server/services/campaigns";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string }>;

export const metadata = { title: "Edit campaign — EvoHome CRM" };

export default async function EditCampaignPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to edit campaigns.
        </p>
      </PageContainer>
    );
  }

  if (!hasPermission(access.context.membership.role.permissions, "campaign:update")) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to edit campaigns.
        </p>
      </PageContainer>
    );
  }

  let campaign;

  try {
    campaign = await getCampaignForWorkspace(access.context.workspace.id, campaignId);
  } catch {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">Campaign not found.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <CampaignFormPage
        workspaceSlug={workspaceSlug}
        mode="edit"
        campaignId={campaignId}
        initialValues={{
          name: campaign.name,
          audienceType: campaign.audienceType,
          defaultFromName: campaign.senderName ?? campaign.defaultFromName ?? "",
          sending: {
            sendingDomainId: campaign.sendingDomainId ?? "",
            senderEmail: campaign.senderEmail ?? "",
          },
          enrollment: {
            projectIds: campaign.projectIds,
            autoEnrollmentEnabled: campaign.autoEnrollmentEnabled,
            enrollmentTrigger: campaign.enrollmentTrigger,
            enrollmentRules: campaign.enrollmentRules,
          },
        }}
      />
    </PageContainer>
  );
}
