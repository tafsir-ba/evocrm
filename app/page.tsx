import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  listActiveWorkspacesForUser,
  resolveFirstWorkspaceSlugForUser,
} from "@/server/services/workspaces";
import { syncUserFromProviderProfile } from "@/server/services/users";
import { workspaceNavPath } from "@/lib/workspace-paths";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await syncUserFromProviderProfile({
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  const workspaces = await listActiveWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/workspaces");
  }

  const slug =
    (await resolveFirstWorkspaceSlugForUser(user.id)) ?? workspaces[0].slug;

  redirect(workspaceNavPath(slug, "dashboard"));
}
