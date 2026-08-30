import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceListItem } from "@/components/workspaces/workspace-manage";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/auth";
import {
  CLEAR_INVALID_SESSION_PATH,
  isCanonicalSessionUserId,
  pageRedirectForMissingOrInvalidSession,
} from "@/lib/session-user-id";
import { findUserById } from "@/server/repositories/users";
import {
  getWorkspaceInitials,
  listActiveWorkspacesForUser,
} from "@/server/services/workspaces";

export const metadata = { title: "Workspaces — EvoHome CRM" };

export default async function WorkspacesPage() {
  const session = await auth();

  if (!session?.user?.id || !isCanonicalSessionUserId(session.user.id)) {
    redirect(pageRedirectForMissingOrInvalidSession(session?.user?.id));
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect(CLEAR_INVALID_SESSION_PATH);
  }

  const workspaces = await listActiveWorkspacesForUser(user.id);

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageHeader
          title="Your workspaces"
          description="Open, edit, create, or delete workspaces at any time."
          actions={
            <Link href="/workspaces/new">
              <Button>Create workspace</Button>
            </Link>
          }
        />

        {workspaces.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-8 text-center">
            <h2 className="text-[18px] font-semibold text-[var(--color-ink)]">
              No workspace yet
            </h2>
            <p className="text-[14px] text-[var(--color-ink-muted)] mt-2">
              Create your first workspace to start using EvoHome CRM.
            </p>
            <Link href="/workspaces/new" className="inline-block mt-5">
              <Button size="lg">Create workspace</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {workspaces.map((workspace) => (
              <WorkspaceListItem
                key={workspace.id}
                workspace={workspace}
                initials={getWorkspaceInitials(workspace.name)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
