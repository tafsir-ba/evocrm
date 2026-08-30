import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  CLEAR_INVALID_SESSION_PATH,
  isCanonicalSessionUserId,
  pageRedirectForMissingOrInvalidSession,
} from "@/lib/session-user-id";
import {
  listActiveWorkspacesForUser,
  resolveFirstWorkspaceSlugForUser,
} from "@/server/services/workspaces";
import { findUserById } from "@/server/repositories/users";
import { workspaceNavPath } from "@/lib/workspace-paths";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id || !isCanonicalSessionUserId(session.user.id)) {
    redirect(pageRedirectForMissingOrInvalidSession(session?.user?.id));
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect(CLEAR_INVALID_SESSION_PATH);
  }

  const workspaces = await listActiveWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/workspaces");
  }

  const slug =
    (await resolveFirstWorkspaceSlugForUser(user.id)) ?? workspaces[0].slug;

  redirect(workspaceNavPath(slug, "dashboard"));
}
