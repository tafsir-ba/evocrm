import { LeadFormPage } from "@/components/leads/lead-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "New lead — EvoHome CRM" };

export default async function NewLeadPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
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

  return (
    <PageContainer>
      <LeadFormPage
        workspaceSlug={workspaceSlug}
        mode="create"
        cancelHref={workspacePath(workspaceSlug, "leads")}
        back={{ href: workspacePath(workspaceSlug, "leads"), label: "Back to leads" }}
      />
    </PageContainer>
  );
}
