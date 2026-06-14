import Link from "next/link";

import { UsersPanel } from "@/components/settings/users-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Users — Settings — EvoHome CRM" };

export default async function SettingsUsersPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Users" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view members.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;
  const canManage = hasPermission(permissions, "users:manage");

  return (
    <PageContainer>
      <PageHeader
        title="Users"
        description="Members, roles and membership status."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <UsersPanel workspaceSlug={workspaceSlug} canManage={canManage} />
    </PageContainer>
  );
}
