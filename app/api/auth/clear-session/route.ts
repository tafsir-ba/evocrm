import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { isCanonicalSessionUserId, LOGIN_PATH } from "@/lib/session-user-id";
import { findUserById } from "@/server/repositories/users";

/**
 * Silently clear a missing or invalid session and send the visitor to login.
 * Valid authenticated sessions are preserved (redirect to workspaces).
 * Explicit user-initiated sign-out remains `signOut({ callbackUrl: "/login" })`
 * from the app chrome — this route is not that flow.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId && isCanonicalSessionUserId(userId)) {
    const user = await findUserById(userId);

    if (user) {
      redirect("/workspaces");
    }
  }

  await signOut({ redirectTo: LOGIN_PATH });
}
