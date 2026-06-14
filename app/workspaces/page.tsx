import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/auth";
import {
  isCanonicalSessionUserId,
  STALE_SESSION_RECOVERY_PATH,
} from "@/lib/session-user-id";
import { findUserById } from "@/server/repositories/users";
import {
  getWorkspaceInitials,
  listActiveWorkspacesForUser,
} from "@/server/services/workspaces";
import { workspaceNavPath } from "@/lib/workspace-paths";

export const metadata = { title: "Workspaces — EvoHome CRM" };

export default async function WorkspacesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!isCanonicalSessionUserId(session.user.id)) {
    redirect(STALE_SESSION_RECOVERY_PATH);
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect(STALE_SESSION_RECOVERY_PATH);
  }

  const workspaces = await listActiveWorkspacesForUser(user.id);

  if (workspaces.length === 1) {
    redirect(workspaceNavPath(workspaces[0].slug, "dashboard"));
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageHeader
          title="Your workspaces"
          description="Select a workspace to continue or create a new one."
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
              <li key={workspace.id}>
                <Link
                  href={workspaceNavPath(workspace.slug, "dashboard")}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-4 py-4 hover:border-[var(--color-brand-200)] transition-colors focus-ring"
                >
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-[12px] font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                    }}
                  >
                    {getWorkspaceInitials(workspace.name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--color-ink)] truncate">
                      {workspace.name}
                    </span>
                    <span className="block text-[12.5px] text-[var(--color-ink-muted)]">
                      {workspace.type} · {workspace.timezone} · {workspace.defaultCurrency}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
