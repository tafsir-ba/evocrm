import { OpportunityFormPage } from "@/components/opportunities/opportunity-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;
type SearchParams = Promise<{
  leadId?: string;
  propertyId?: string;
  lockLead?: string;
  lockProperty?: string;
}>;

export const metadata = { title: "New opportunity — EvoHome CRM" };

function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export default async function NewOpportunityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug } = await params;
  const { leadId, propertyId, lockLead, lockProperty } = await searchParams;
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

  if (!hasPermission(permissions, "opportunity:create")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to create opportunities."
        />
      </PageContainer>
    );
  }

  const defaultCurrency = access.context.workspace.defaultCurrency;
  // Explicit lock flags preserve return-from-create flow: original peer stays
  // locked while the newly created peer is only preselected. Fall back to
  // single-id contextual CTAs when no flag is present.
  const shouldLockLead =
    isTruthyFlag(lockLead) || (Boolean(leadId) && !propertyId);
  const shouldLockProperty =
    isTruthyFlag(lockProperty) || (Boolean(propertyId) && !leadId);
  const cancelHref = leadId
    ? workspacePath(workspaceSlug, "leads", leadId)
    : propertyId
      ? workspacePath(workspaceSlug, "properties", propertyId)
      : workspacePath(workspaceSlug, "pipeline");

  return (
    <PageContainer>
      <OpportunityFormPage
        workspaceSlug={workspaceSlug}
        defaultCurrency={defaultCurrency}
        mode="create"
        initialValues={{
          leadId: leadId ?? "",
          propertyId: propertyId ?? "",
        }}
        lockLead={shouldLockLead}
        lockProperty={shouldLockProperty}
        cancelHref={cancelHref}
        back={{
          href: cancelHref,
          label: leadId ? "Back to lead" : propertyId ? "Back to property" : "Back to pipeline",
        }}
      />
    </PageContainer>
  );
}
