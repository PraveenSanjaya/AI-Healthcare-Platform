import { hasRole, isRole, type AppRole } from "./roles";

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthError";
  }
}

export type SessionUser = { id: string; role: AppRole };
type SessionLike = { user?: { id?: string; role?: unknown } | null } | null | undefined;

/** Throws AuthError unless the session has a valid user. */
export function requireUser(session: SessionLike): SessionUser {
  const u = session?.user;
  if (!u?.id || !isRole(u.role)) throw new AuthError("UNAUTHENTICATED");
  return { id: u.id, role: u.role };
}

/** Throws AuthError unless the session user holds at least `min`. */
export function requireRole(session: SessionLike, min: AppRole): SessionUser {
  const user = requireUser(session);
  if (!hasRole(user.role, min)) throw new AuthError("FORBIDDEN");
  return user;
}
