import "server-only";

import { auth } from "@/auth";

import type { AppSession } from "./types";

/**
 * Resolve the current authenticated session.
 */
export async function getSession(): Promise<AppSession | null> {
  const session = await auth();

  if (!session?.user?.email || !session.user.id) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  };
}
