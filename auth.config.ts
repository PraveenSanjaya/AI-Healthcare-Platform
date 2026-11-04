import type { NextAuthConfig } from "next-auth";
import { isRole } from "@/lib/auth/roles";

/** Edge-safe part of the Auth.js config (no DB or bcrypt imports). */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "");
        session.user.role = isRole(token.role) ? token.role : "STAFF";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
