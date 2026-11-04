import { isRole, type AppRole } from "./roles";

export const REVALIDATE_MS = 60_000;

export type TokenLike = { id?: unknown; role?: unknown; checkedAt?: unknown; [k: string]: unknown };
export type LookupUser = (id: string) => Promise<{ role: string; active: boolean } | null>;

/**
 * Re-check the user against the database at most once per REVALIDATE_MS.
 * Returns null when the user is gone or deactivated (the session is then dropped),
 * otherwise the token with a fresh role. Lookup errors propagate (fail closed).
 */
export async function revalidateToken<T extends TokenLike>(
  token: T,
  lookup: LookupUser,
  now: number = Date.now(),
): Promise<T | null> {
  if (typeof token.id !== "string" || !token.id) return null;
  if (typeof token.checkedAt === "number" && now - token.checkedAt < REVALIDATE_MS) return token;
  const user = await lookup(token.id);
  if (!user || !user.active || !isRole(user.role)) return null;
  return { ...token, role: user.role satisfies AppRole, checkedAt: now };
}
