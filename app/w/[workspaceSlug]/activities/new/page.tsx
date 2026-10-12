import { ActivityFormPage } from "@/components/activities/activity-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import {
  readSafeWorkflowHref,
  workflowBackLabel,
} from "@/lib/workflow-navigation";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;
type SearchParams = Promise<{
  leadId?: string;
  propertyId?: string;
  opportunityId?: string;
  returnTo?: string;
}>;

export const metadata = { title: "New activity — EvoHome CRM" };

export default async function NewActivityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug } = await params;
  const {
    leadId,
    propertyId,
    opportunityId,
    returnTo: rawReturnTo,
  } = await searchParams;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to view activities."
        />
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "activity:create")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to create activities."
        />
      </PageContainer>
    );
  }

  const context = { leadId, propertyId, opportunityId };
  const workflowReturn = readSafeWorkflowHref(rawReturnTo, workspaceSlug);
  const cancelHref =
    workflowReturn ??
    (leadId
      ? workspacePath(workspaceSlug, "leads", leadId)
      : propertyId
        ? workspacePath(workspaceSlug, "properties", propertyId)
        : opportunityId
          ? workspacePath(workspaceSlug, "opportunities", opportunityId)
          : workspacePath(workspaceSlug, "activities"));

  return (
    <PageContainer>
      <ActivityFormPage
        workspaceSlug={workspaceSlug}
        workspaceTimezone={access.context.workspace.timezone}
        mode="create"
        context={context}
        returnTo={workflowReturn}
        cancelHref={cancelHref}
        back={{
          href: cancelHref,
          label: workflowReturn
            ? workflowBackLabel(cancelHref, workspaceSlug)
            : leadId
              ? "Back to lead"
              : propertyId
                ? "Back to property"
                : opportunityId
                  ? "Back to opportunity"
                  : "Back to activities",
        }}
      />
    </PageContainer>
  );
}
