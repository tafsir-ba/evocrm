import { OpportunityFormPage } from "@/components/opportunities/opportunity-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import {
  readSafeWorkflowHref,
  workflowBackLabel,
} from "@/lib/workflow-navigation";
import { hasPermission } from "@/server/permissions/permissions";
import { getOpportunityForWorkspace } from "@/server/services/opportunities";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; opportunityId: string }>;
type SearchParams = Promise<{ returnTo?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit opportunity — ${workspaceSlug}` };
}

export default async function EditOpportunityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug, opportunityId } = await params;
  const { returnTo: rawReturnTo } = await searchParams;
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
  const returnTo = readSafeWorkflowHref(rawReturnTo, workspaceSlug);
  const cancelHref =
    returnTo ?? workspacePath(workspaceSlug, "opportunities", opportunityId);

  return (
    <PageContainer>
      <OpportunityFormPage
        workspaceSlug={workspaceSlug}
        defaultCurrency={opportunity.currency}
        mode="edit"
        opportunityId={opportunityId}
        initialValues={{
          leadId: opportunity.leadId,
          propertyId: opportunity.propertyId,
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
        returnTo={returnTo}
        cancelHref={cancelHref}
        back={{
          href: cancelHref,
          label: returnTo
            ? workflowBackLabel(cancelHref, workspaceSlug)
            : "Back to opportunity",
        }}
      />
    </PageContainer>
  );
}
