import { LeadsPanel } from "@/components/leads/leads-panel";
import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Leads — EvoHome CRM" };

export default async function LeadsPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view leads.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <ProjectFilterSuspense>
        <LeadsPanel
          workspaceSlug={workspaceSlug}
          canCreate={hasPermission(permissions, "lead:create")}
          canCreateProject={hasPermission(permissions, "project:create")}
          canArchive={hasPermission(permissions, "lead:archive")}
          canDelete={hasPermission(permissions, "lead:delete")}
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
