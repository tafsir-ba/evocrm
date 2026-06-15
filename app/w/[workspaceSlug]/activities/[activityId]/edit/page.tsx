import { ActivityFormPage } from "@/components/activities/activity-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { getActivityForWorkspace } from "@/server/services/activities";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import {
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; activityId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  return { title: `Edit activity — ${workspaceSlug}` };
}

export default async function EditActivityPage({ params }: { params: Params }) {
  const { workspaceSlug, activityId } = await params;
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

  if (!hasPermission(permissions, "activity:update")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to edit activities."
        />
      </PageContainer>
    );
  }

  const timezone = access.context.workspace.timezone;
  const activity = await getActivityForWorkspace(access.context.workspace.id, activityId);

  const cancelHref = activity.lead
    ? workspacePath(workspaceSlug, "leads", activity.lead.id)
    : activity.property
      ? workspacePath(workspaceSlug, "properties", activity.property.id)
      : activity.opportunity
        ? workspacePath(workspaceSlug, "opportunities", activity.opportunity.id)
        : workspacePath(workspaceSlug, "activities");

  return (
    <PageContainer>
      <ActivityFormPage
        workspaceSlug={workspaceSlug}
        workspaceTimezone={timezone}
        mode="edit"
        activityId={activityId}
        initialValues={{
          typeId: activity.typeId,
          statusId: activity.statusId,
          title: activity.title,
          description: activity.description ?? "",
          dueDate: toDatetimeLocalInWorkspaceTimezone(activity.dueDate, timezone),
          nextActionDate: toDatetimeLocalInWorkspaceTimezone(
            activity.nextActionDate,
            timezone,
          ),
          assignedTo: activity.assignedTo ?? "",
          outcome: activity.outcome ?? "",
        }}
        cancelHref={cancelHref}
        back={{ href: cancelHref, label: "Back" }}
      />
    </PageContainer>
  );
}
