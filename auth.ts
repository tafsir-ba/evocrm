import NextAuth from "next-auth";

import { getAuthConfig } from "@/auth.config";
import { syncUserFromProviderProfile } from "@/server/services/users";

const authConfig = getAuthConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      await syncUserFromProviderProfile({
        email: user.email,
        name: user.name,
        image: user.image,
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const { findUserByEmail } = await import("@/server/repositories/users");
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
