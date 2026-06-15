import { OpportunityFormPage } from "@/components/opportunities/opportunity-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { getOpportunityForWorkspace } from "@/server/services/opportunities";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; opportunityId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit opportunity — ${workspaceSlug}` };
}

export default async function EditOpportunityPage({ params }: { params: Params }) {
  const { workspaceSlug, opportunityId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to view opportunities."
        />
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "opportunity:update")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to edit opportunities."
        />
      </PageContainer>
    );
  }

  const opportunity = await getOpportunityForWorkspace(
    access.context.workspace.id,
    opportunityId,
  );

  return (
    <PageContainer>
      <OpportunityFormPage
        workspaceSlug={workspaceSlug}
        defaultCurrency={opportunity.currency}
        mode="edit"
        opportunityId={opportunityId}
        initialValues={{
          value: opportunity.value?.toString() ?? "",
          currency: opportunity.currency,
          expectedCloseDate: opportunity.expectedCloseDate
            ? opportunity.expectedCloseDate instanceof Date
              ? opportunity.expectedCloseDate.toISOString().slice(0, 10)
              : String(opportunity.expectedCloseDate).slice(0, 10)
            : "",
          notes: opportunity.notes ?? "",
          assignedTo: opportunity.assignedUser?.id ?? "",
          tagIds: opportunity.tagsResolved.map((tag) => tag.id),
        }}
        cancelHref={workspacePath(workspaceSlug, "opportunities", opportunityId)}
        back={{
          href: workspacePath(workspaceSlug, "opportunities", opportunityId),
          label: "Back to opportunity",
        }}
      />
    </PageContainer>
  );
}
