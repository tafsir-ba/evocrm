import Link from "next/link";

import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Integrations — Settings — EvoHome CRM" };

export default async function SettingsIntegrationsPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Integrations" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view settings.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;
  const canUpdate = hasPermission(permissions, "settings:update");

  return (
    <PageContainer>
      <PageHeader
        title="Integrations"
        description="Manage website lead capture and future external connections."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <IntegrationsPanel workspaceSlug={workspaceSlug} canUpdate={canUpdate} />
    </PageContainer>
  );
}
