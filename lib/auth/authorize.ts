import bcrypt from "bcryptjs";
import { loginSchema } from "./schemas";
import { verifyPassword } from "./password";

export type AuthUserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  active: boolean;
};
export type FindUserByEmail = (email: string) => Promise<AuthUserRecord | null>;

// Hash of a throwaway string, compared when the user is missing to even out timing.
const DUMMY_HASH = bcrypt.hashSync("clinicassist-timing-equaliser", 12);

/** Credentials check, DB access injected so it can be unit tested. */
export async function authorizeCredentials(raw: unknown, findUser: FindUserByEmail) {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const user = await findUser(parsed.data.email);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
