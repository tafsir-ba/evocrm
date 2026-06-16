import Link from "next/link";

import { SendingDomainsPanel } from "@/components/settings/sending-domains-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Sending Domains — Settings — EvoHome CRM" };

export default async function SettingsSendingDomainsPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Sending Domains" />
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
        title="Sending Domains"
        description="Verify domains for campaign email sending and manage sender addresses."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <SendingDomainsPanel workspaceSlug={workspaceSlug} canUpdate={canUpdate} />
    </PageContainer>
  );
}
