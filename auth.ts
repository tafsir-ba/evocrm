import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getAuthConfig } from "@/auth.config";
import { resolveJwtSub } from "@/server/auth/resolve-jwt-sub";
import { verifyCredentialsLogin } from "@/server/services/credentials-auth";
import { syncUserFromProviderProfile } from "@/server/services/users";
import { credentialsLoginSchema } from "@/server/validation/auth";

const authConfig = getAuthConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsLoginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await verifyCredentialsLogin(parsed.data);

        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (!user.email) {
        return false;
      }

      if (account?.provider === "google") {
        try {
          await syncUserFromProviderProfile({
            email: user.email,
            name: user.name,
            image: user.image,
          });
        } catch (error) {
          console.error("[auth] Google sign-in profile sync failed:", error);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      const sub = await resolveJwtSub({
        userId: user?.id,
        email: user?.email ?? token.email,
      });

      if (sub) {
        token.sub = sub;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
