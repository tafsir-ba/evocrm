import { Suspense } from "react";

import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { PageContainer } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Dashboard — EvoHome CRM" };

export default async function DashboardPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view the dashboard.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="min-w-0 overflow-x-hidden">
      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Skeleton className="h-48 rounded-lg" />
              <Skeleton className="h-48 rounded-lg" />
            </div>
          </div>
        }
      >
        <DashboardPanel
          workspaceSlug={workspaceSlug}
          workspaceTimezone={access.context.workspace.timezone}
        />
      </Suspense>
    </PageContainer>
  );
}
