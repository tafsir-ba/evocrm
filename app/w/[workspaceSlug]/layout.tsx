import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceShellProvider } from "@/components/layout/workspace-shell-context";
import {
  getWorkspaceInitials,
  listActiveWorkspacesForUser,
} from "@/server/services/workspaces";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
};

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);
  const workspaces = await listActiveWorkspacesForUser(access.user.id);

  return (
    <WorkspaceShellProvider
      value={{
        user: access.user,
        workspace: {
          ...access.context.workspace,
          initials: getWorkspaceInitials(access.context.workspace.name),
        },
        navigation: access.context.navigation,
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          initials: getWorkspaceInitials(workspace.name),
        })),
        permissionDenied: access.permissionDenied,
      }}
    >
      <AppShell>{children}</AppShell>
    </WorkspaceShellProvider>
  );
}
