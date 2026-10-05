import { GrowthCampaignOverviewPanel } from "@/components/advertising/growth-campaign-overview-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { AppError } from "@/server/errors";
import { hasPermission } from "@/server/permissions/permissions";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
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

  // Overview API is membership-scoped (workspace-wide accounts/connections).
  // Do not offer this page to grant-only collaborators who would only see an error.
  const canReadAds =
    access.context.accessMode === "member" &&
    hasPermission(
      access.context.membership.role.permissions,
      "advertising:read",
    );

  if (access.permissionDenied || !canReadAds) {
    return (
      <PageContainer>
        <PageHeader title="Paid ads" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this project’s paid ads.
        </p>
      </PageContainer>
    );
  }

  try {
    await requireProjectAccess(
      access.context.workspace.id,
      access.user.id,
      projectId,
      "project:read",
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      return (
        <PageContainer>
          <PageHeader title="Paid ads" />
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            You do not have access to this project.
          </p>
        </PageContainer>
      );
    }
    throw error;
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
