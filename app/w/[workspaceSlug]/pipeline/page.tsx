import { Suspense } from "react";

import { PipelinePanel } from "@/components/opportunities/pipeline-panel";
import { PageContainer } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Pipeline — EvoHome CRM" };

function PipelinePanelFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[320px] w-[280px] shrink-0" />
        ))}
      </div>
    </div>
  );
}

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
    <PageContainer className="pb-0 min-w-0 overflow-x-hidden">
      <Suspense fallback={<PipelinePanelFallback />}>
        <PipelinePanel
          workspaceSlug={workspaceSlug}
          defaultCurrency={access.context.workspace.defaultCurrency}
          canCreate={hasPermission(permissions, "opportunity:create")}
          canUpdate={hasPermission(permissions, "opportunity:update")}
        />
      </Suspense>
    </PageContainer>
  );
}
