import { redirect } from "next/navigation";

import { VisitNotesApp } from "@/components/visit-notes/visit-notes-app";
import { auth } from "@/auth";
import {
  CLEAR_INVALID_SESSION_PATH,
  isCanonicalSessionUserId,
  pageRedirectForMissingOrInvalidSession,
} from "@/lib/session-user-id";
import { findUserById } from "@/server/repositories/users";
import { listActiveWorkspacesForUser } from "@/server/services/workspaces";

export const metadata = { title: "Notes — EvoHome CRM" };

export default async function NotesPage() {
  const session = await auth();

  if (!session?.user?.id || !isCanonicalSessionUserId(session.user.id)) {
    redirect(pageRedirectForMissingOrInvalidSession(session?.user?.id));
  }

  const user = await findUserById(session.user.id);
  if (!user) {
    redirect(CLEAR_INVALID_SESSION_PATH);
  }

  const workspaces = await listActiveWorkspacesForUser(user.id);
  const initialWorkspaces = workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    timezone: workspace.timezone,
  }));

  return (
    <VisitNotesApp
      initialWorkspaces={initialWorkspaces}
      initialWorkspaceSlug={initialWorkspaces[0]?.slug ?? null}
    />
  );
}
