import { AdvertisingSettingsPanel } from "@/components/settings/advertising-settings-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Paid ads — Settings — EvoHome CRM" };

export default async function SettingsAdvertisingPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (!isAdvertisingEnabled()) {
    return (
      <PageContainer>
        <PageHeader title="Paid ads" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Paid ads tools are turned off for now. Ask an admin when the pilot starts.
        </p>
      </PageContainer>
    );
  }

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Paid ads" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view paid ads settings.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;
  const canConnect = hasPermission(permissions, "advertising:connect");
  const canCreate = hasPermission(permissions, "advertising:create");

  return (
    <PageContainer>
      <PageHeader
        title="Paid ads"
        description="Connect Meta and refresh read-only ads data for the Satigny duplex pilot."
        back={{ href: `/w/${workspaceSlug}/settings`, label: "Settings" }}
      />
      <AdvertisingSettingsPanel
        workspaceSlug={workspaceSlug}
        canConnect={canConnect}
        canCreate={canCreate}
      />
    </PageContainer>
  );
}
