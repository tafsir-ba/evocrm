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
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
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
