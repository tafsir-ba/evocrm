import { Suspense } from "react";

import { LeadFormPage } from "@/components/leads/lead-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { isSafeOpportunityReturnTo } from "@/lib/opportunity-link-flow";
import {
  projectLeadsHref,
  readSafeWorkflowHref,
  workflowBackLabel,
} from "@/lib/workflow-navigation";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;
type SearchParams = Promise<{ projectId?: string; returnTo?: string }>;

export const metadata = { title: "New lead — EvoHome CRM" };

export default async function NewLeadPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug } = await params;
  const { projectId, returnTo: rawReturnTo } = await searchParams;
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

  if (!hasPermission(permissions, "lead:create")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to create leads."
        />
      </PageContainer>
    );
  }

  const opportunityReturn =
    rawReturnTo && isSafeOpportunityReturnTo(rawReturnTo, workspaceSlug)
      ? rawReturnTo
      : undefined;
  const workflowReturn = opportunityReturn
    ? undefined
    : readSafeWorkflowHref(rawReturnTo, workspaceSlug);
  const returnTo = opportunityReturn ?? workflowReturn;
  const cancelHref =
    returnTo ??
    (projectId
      ? projectLeadsHref(workspaceSlug, projectId)
      : workspacePath(workspaceSlug, "leads"));

  return (
    <PageContainer className="max-md:px-3 max-md:py-1.5">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <LeadFormPage
          workspaceSlug={workspaceSlug}
          mode="create"
          initialValues={projectId ? { projectId } : undefined}
          returnTo={returnTo ?? undefined}
          cancelHref={cancelHref}
          back={{
            href: cancelHref,
            label: opportunityReturn
              ? "Back to opportunity"
              : workflowBackLabel(cancelHref, workspaceSlug),
          }}
        />
      </Suspense>
    </PageContainer>
  );
}
