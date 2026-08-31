import { LeadDetailPanel } from "@/components/leads/lead-detail-panel";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; leadId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug, leadId } = await params;
  return { title: `Lead ${leadId} — ${workspaceSlug}` };
}

export default async function LeadDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, leadId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view this lead.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  return (
    <PageContainer>
      <LeadDetailPanel
        workspaceSlug={workspaceSlug}
        leadId={leadId}
        defaultCurrency={access.context.workspace.defaultCurrency}
        workspaceTimezone={access.context.workspace.timezone}
        canUpdate={hasPermission(permissions, "lead:update")}
        canArchive={hasPermission(permissions, "lead:archive")}
        canReadOpportunities={hasPermission(permissions, "opportunity:read")}
        canCreateOpportunity={hasPermission(permissions, "opportunity:create")}
        canReadActivities={hasPermission(permissions, "activity:read")}
        canCreateActivity={hasPermission(permissions, "activity:create")}
        canUpdateActivity={hasPermission(permissions, "activity:update")}
        canArchiveActivity={hasPermission(permissions, "activity:archive")}
        canReadDocuments={hasPermission(permissions, "document:read")}
        canCreateDocument={hasPermission(permissions, "document:create")}
        canArchiveDocument={hasPermission(permissions, "document:archive")}
        canEnrich={hasPermission(permissions, "lead:enrich")}
        canEnrichRevoke={hasPermission(permissions, "lead:enrich_revoke")}
        canFinancialRead={hasPermission(permissions, "lead:financial_read")}
        canFinancialUpdate={hasPermission(permissions, "lead:financial_update")}
        canFinancialDelete={hasPermission(permissions, "lead:financial_delete")}
      />
    </PageContainer>
  );
}
