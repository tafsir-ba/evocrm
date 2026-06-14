import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { PageContainer } from "@/components/layout/page-header";
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
    <PageContainer>
      <DashboardPanel
        workspaceSlug={workspaceSlug}
        workspaceTimezone={access.context.workspace.timezone}
      />
    </PageContainer>
  );
}
