import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { getEnv } from "@/server/env";

function getAuthSecret(): string {
  const env = getEnv();

  if (env.NEXTAUTH_SECRET) {
    return env.NEXTAUTH_SECRET;
  }

  if (env.NODE_ENV === "test") {
    return "test-nextauth-secret-minimum-32-characters";
  }

  if (env.NODE_ENV === "development") {
    return "development-nextauth-secret-minimum-32";
  }

  return "build-time-nextauth-secret-placeholder-32";
}

function getAuthProviders() {
  const env = getEnv();

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return [];
  }

  return [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ];
}

export function getAuthConfig(): NextAuthConfig {
  return {
    providers: getAuthProviders(),
    secret: getAuthSecret(),
    trustHost: true,
    pages: {
      signIn: "/login",
    },
    session: {
      strategy: "jwt",
    },
    callbacks: {
      async session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
        }

        return session;
      },
    },
  };
}
