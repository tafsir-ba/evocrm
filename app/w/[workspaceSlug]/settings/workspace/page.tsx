import Link from "next/link";

import { WorkspaceSettingsPanel } from "@/components/settings/workspace-settings-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Workspace — Settings — EvoHome CRM" };

export default async function SettingsWorkspacePage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Workspace" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view workspace settings.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;
  const canUpdate = hasPermission(permissions, "settings:update");
  const canDelete = access.context.membership.role.key === "owner";

  return (
    <PageContainer>
      <PageHeader
        title="Workspace"
        description="Name, locale, currency and workspace identity."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <WorkspaceSettingsPanel
        workspaceSlug={workspaceSlug}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </PageContainer>
  );
}
