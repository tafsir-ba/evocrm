import {
  LeadFormPage,
  type LeadFormInitialValues,
} from "@/components/leads/lead-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { ProjectFilterSuspense } from "@/components/layout/project-filter-suspense";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import {
  readSafeWorkflowHref,
  workflowBackLabel,
} from "@/lib/workflow-navigation";
import { hasPermission } from "@/server/permissions/permissions";
import { getLeadForWorkspace } from "@/server/services/leads";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; leadId: string }>;
type SearchParams = Promise<{ returnTo?: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit lead — ${workspaceSlug}` };
}

export default async function EditLeadPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug, leadId } = await params;
  const { returnTo: rawReturnTo } = await searchParams;
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
    companyId: lead.companyId ?? "",
    companyName: lead.company?.name,
    industry: lead.industry ?? "",
    jobTitle: lead.jobTitle ?? "",
    stateRegion: lead.stateRegion ?? "",
  };

  const returnTo = readSafeWorkflowHref(rawReturnTo, workspaceSlug);
  const cancelHref = returnTo ?? workspacePath(workspaceSlug, "leads", leadId);

  return (
    <PageContainer className="max-md:px-3 max-md:py-1.5">
      <ProjectFilterSuspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <LeadFormPage
          workspaceSlug={workspaceSlug}
          mode="edit"
          leadId={leadId}
          initialValues={initialValues}
          returnTo={returnTo}
          cancelHref={cancelHref}
          back={{
            href: cancelHref,
            label: workflowBackLabel(cancelHref, workspaceSlug),
          }}
        />
      </ProjectFilterSuspense>
    </PageContainer>
  );
}
