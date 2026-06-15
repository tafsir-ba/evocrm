import { CampaignFormPage } from "@/components/campaigns/campaign-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "New campaign — EvoHome CRM" };

export default async function NewCampaignPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to create campaigns.
        </p>
      </PageContainer>
    );
  }

  if (!hasPermission(access.context.membership.role.permissions, "campaign:create")) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to create campaigns.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <CampaignFormPage workspaceSlug={workspaceSlug} mode="create" />
    </PageContainer>
  );
}
