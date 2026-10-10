import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { ProjectLeadsPanel } from "@/components/projects/project-leads-panel";
import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { AppError } from "@/server/errors";
import { hasPermission } from "@/server/permissions/permissions";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import { getLeadEnrichmentCapability } from "@/server/services/lead-enrichment";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; projectId: string }>;

export const metadata = { title: "Leads — Project — EvoHome CRM" };

async function isLeadEnrichmentEnabled(workspaceId: string): Promise<boolean> {
  try {
    const capability = await getLeadEnrichmentCapability(workspaceId);
    return capability.enabled;
  } catch {
    return false;
  }
}

export default async function ProjectLeadsPage({ params }: { params: Params }) {
  const { workspaceSlug, projectId } = await params;
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

  try {
    await requireProjectAccess(
      access.context.workspace.id,
      access.user.id,
      projectId,
      "lead:read",
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      return (
        <PageContainer>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            You do not have access to this project’s leads.
          </p>
        </PageContainer>
      );
    }
    throw error;
  }

  const permissions = access.context.membership.role.permissions;
  const canEnrich =
    hasPermission(permissions, "lead:enrich") &&
    (await isLeadEnrichmentEnabled(access.context.workspace.id));

  return (
    <PageContainer className="flex min-h-0 flex-1 flex-col">
      <ProjectFilterSuspense>
        <ProjectLeadsPanel
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          canCreate={hasPermission(permissions, "lead:create")}
          canCreateProject={hasPermission(permissions, "project:create")}
          canArchive={hasPermission(permissions, "lead:archive")}
          canDelete={hasPermission(permissions, "lead:delete")}
          canUpdate={hasPermission(permissions, "lead:update")}
          canManageStatuses={hasPermission(permissions, "settings:update")}
          canCreateNotes={hasPermission(permissions, "activity:create")}
          canEnrich={canEnrich}
          canRequestMarketEstimate={hasPermission(permissions, "lead:financial_update")}
          canUpdateProject={hasPermission(permissions, "project:update")}
          showPaidAds={
            isAdvertisingEnabled() &&
            access.context.accessMode === "member" &&
            hasPermission(permissions, "advertising:read")
          }
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
