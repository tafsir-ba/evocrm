import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getAuthConfig } from "@/auth.config";
import { findUserByEmail } from "@/server/repositories/users";
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
        const existing = await findUserByEmail(user.email);

        if (existing?.authProvider === "credentials") {
          return false;
        }

        await syncUserFromProviderProfile({
          email: user.email,
          name: user.name,
          image: user.image,
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      } else if (user?.email) {
        const dbUser = await findUserByEmail(user.email);

        if (dbUser) {
          token.sub = dbUser.id;
        }
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
