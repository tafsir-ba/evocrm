import { PipelinePanel } from "@/components/opportunities/pipeline-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Pipeline — EvoHome CRM" };

export default async function PipelinePage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view the pipeline.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer className="pb-0">
      <PipelinePanel
        workspaceSlug={workspaceSlug}
        defaultCurrency={access.context.workspace.defaultCurrency}
        canCreate={hasPermission(permissions, "opportunity:create")}
        canUpdate={hasPermission(permissions, "opportunity:update")}
      />
    </PageContainer>
  );
}
