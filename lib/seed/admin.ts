import { hashPassword } from "@/lib/auth/password";
import { loginSchema, passwordSchema } from "@/lib/auth/schemas";

export type AdminUpsert = (args: {
  email: string;
  create: { name: string; email: string; passwordHash: string; role: "ADMIN"; active: true };
  update: { role: "ADMIN"; active: true };
}) => Promise<{ id: string; email: string }>;

/**
 * Idempotently ensure the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD exists.
 * An existing account keeps its password; it is only (re)promoted to an active ADMIN.
 */
export async function seedAdmin(env: Record<string, string | undefined>, upsert: AdminUpsert) {
  const email = loginSchema.shape.email.safeParse(env.SEED_ADMIN_EMAIL);
  if (!email.success) throw new Error("SEED_ADMIN_EMAIL is missing or not a valid email");
  const password = passwordSchema.safeParse(env.SEED_ADMIN_PASSWORD);
  if (!password.success) {
    throw new Error(`SEED_ADMIN_PASSWORD rejected: ${password.error.issues[0]?.message}`);
  }
  return upsert({
    email: email.data,
    create: {
      name: "Administrator",
      email: email.data,
      passwordHash: await hashPassword(password.data),
      role: "ADMIN",
      active: true,
    },
    update: { role: "ADMIN", active: true },
  });
}
