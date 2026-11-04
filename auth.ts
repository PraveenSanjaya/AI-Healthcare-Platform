import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { revalidateToken } from "@/lib/auth/revalidate";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Re-check active/role against the DB (at most every 60s); null drops the session.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      return revalidateToken(token, (id) =>
        prisma.user.findUnique({ where: { id }, select: { role: true, active: true } }),
      );
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (raw) =>
        authorizeCredentials(raw, (email) => prisma.user.findUnique({ where: { email } })),
    }),
  ],
});
