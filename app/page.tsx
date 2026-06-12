import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  listActiveWorkspacesForUser,
  resolveFirstWorkspaceSlugForUser,
} from "@/server/services/workspaces";
import { findUserById } from "@/server/repositories/users";
import { workspaceNavPath } from "@/lib/workspace-paths";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect("/login");
  }

  const workspaces = await listActiveWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/workspaces");
  }

  const slug =
    (await resolveFirstWorkspaceSlugForUser(user.id)) ?? workspaces[0].slug;

  redirect(workspaceNavPath(slug, "dashboard"));
}
