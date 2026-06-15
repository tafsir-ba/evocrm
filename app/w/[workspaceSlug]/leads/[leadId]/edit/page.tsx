import { LeadFormPage, type LeadFormInitialValues } from "@/components/leads/lead-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { getLeadForWorkspace } from "@/server/services/leads";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; leadId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit lead — ${workspaceSlug}` };
}

export default async function EditLeadPage({ params }: { params: Params }) {
  const { workspaceSlug, leadId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to view leads."
        />
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "lead:update")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to edit leads."
        />
      </PageContainer>
    );
  }

  const lead = await getLeadForWorkspace(access.context.workspace.id, leadId);

  const initialValues: LeadFormInitialValues = {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    statusId: lead.statusId,
    sourceId: lead.sourceId ?? "",
    language: lead.language ?? "",
    preferredContactMethod: lead.preferredContactMethod ?? "",
    budgetMin: lead.budgetMin?.toString() ?? "",
    budgetMax: lead.budgetMax?.toString() ?? "",
    preferredAreas: lead.preferredAreas.join(", "),
    propertyTypeInterests: lead.propertyTypeInterests,
    transactionIntent: lead.transactionIntent ?? "",
    usagePurpose: lead.usagePurpose ?? "",
    notes: lead.notes ?? "",
    tagIds: lead.tags,
    assignedTo: lead.assignedUser?.id ?? "",
  };

  return (
    <PageContainer>
      <LeadFormPage
        workspaceSlug={workspaceSlug}
        mode="edit"
        leadId={leadId}
        initialValues={initialValues}
        cancelHref={workspacePath(workspaceSlug, "leads", leadId)}
        back={{
          href: workspacePath(workspaceSlug, "leads", leadId),
          label: "Back to lead",
        }}
      />
    </PageContainer>
  );
}
