import Link from "next/link";

import { ProjectsPanel } from "@/components/settings/projects-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Projects — Settings — EvoHome CRM" };

export default async function SettingsProjectsPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Projects" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view projects.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;
  const canUpdate = hasPermission(permissions, "settings:update");

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Lightweight property groupings managed in Settings."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <ProjectsPanel workspaceSlug={workspaceSlug} canUpdate={canUpdate} />
    </PageContainer>
  );
}
