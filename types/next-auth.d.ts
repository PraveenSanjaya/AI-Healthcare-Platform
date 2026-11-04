import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: AppRole; name?: string | null; email?: string | null };
  }
}
