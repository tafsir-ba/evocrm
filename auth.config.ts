import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { getEnv } from "@/server/env";

/**
 * Resolve NEXTAUTH_SECRET with fail-closed production runtime behavior.
 * Exported for unit tests.
 */
export function resolveAuthSecret(
  env: Pick<import("@/server/env").Env, "NODE_ENV" | "NEXTAUTH_SECRET">,
  options?: { isProductionBuild?: boolean },
): string {
  if (env.NEXTAUTH_SECRET) {
    return env.NEXTAUTH_SECRET;
  }

  if (env.NODE_ENV === "test") {
    return "test-nextauth-secret-minimum-32-characters";
  }

  if (env.NODE_ENV === "development") {
    return "development-nextauth-secret-minimum-32";
  }

  // Next.js build collects page data without runtime secrets — not used at runtime.
  if (options?.isProductionBuild) {
    return "build-time-nextauth-secret-placeholder-32";
  }

  throw new Error(
    "NEXTAUTH_SECRET is required in production. Set it in your environment configuration.",
  );
}

function getAuthSecret(): string {
  const env = getEnv();

  return resolveAuthSecret(env, {
    isProductionBuild: process.env.NEXT_PHASE === "phase-production-build",
  });
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
      authorization: {
        params: {
          prompt: "select_account",
          scope: "openid email profile",
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          image: profile.picture,
        };
      },
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
      error: "/login",
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
