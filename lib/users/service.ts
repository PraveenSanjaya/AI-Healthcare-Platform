import { AUDIT, type AuditWriter } from "@/lib/audit/actions";
import { requireRole, type SessionUser } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { createUserSchema } from "@/lib/auth/schemas";
import { isRole, type AppRole } from "@/lib/auth/roles";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: Date;
};

/** Persistence port; the Prisma implementation lives in repo.ts. */
export type UserRepo = {
  list(): Promise<UserSummary[]>;
  emailExists(email: string): Promise<boolean>;
  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: AppRole;
  }): Promise<UserSummary>;
  update(id: string, data: { role?: AppRole; active?: boolean }): Promise<UserSummary | null>;
};

type SessionLike = Parameters<typeof requireRole>[0];

export class UserError extends Error {
  constructor(
    public readonly code: "VALIDATION" | "CONFLICT" | "SELF_CHANGE" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

function admin(session: SessionLike): SessionUser {
  return requireRole(session, "ADMIN");
}

export async function listUsers(session: SessionLike, repo: UserRepo) {
  admin(session);
  return repo.list();
}

/**
 * Every change below writes an audit row when an `audit` writer is given (the server actions
 * always pass one). Metadata holds ids and roles only, never passwords, hashes or emails.
 */
export async function createUser(
  session: SessionLike,
  repo: UserRepo,
  input: unknown,
  audit?: AuditWriter,
) {
  const me = admin(session);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new UserError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { password, ...rest } = parsed.data;
  if (await repo.emailExists(rest.email)) {
    throw new UserError("CONFLICT", "A user with that email already exists");
  }
  const created = await repo.create({ ...rest, passwordHash: await hashPassword(password) });
  await audit?.({
    actorId: me.id,
    action: AUDIT.USER_CREATED,
    entityType: "User",
    entityId: created.id,
    metadata: { role: created.role },
  });
  return created;
}

export async function changeRole(
  session: SessionLike,
  repo: UserRepo,
  targetId: string,
  role: unknown,
  audit?: AuditWriter,
) {
  const me = admin(session);
  if (!isRole(role)) throw new UserError("VALIDATION", "Unknown role");
  if (targetId === me.id) throw new UserError("SELF_CHANGE", "You cannot change your own role");
  const before = (await repo.list()).find((u) => u.id === targetId);
  const updated = await repo.update(targetId, { role });
  if (!updated) throw new UserError("NOT_FOUND", "User not found");
  if (before?.role !== updated.role) {
    await audit?.({
      actorId: me.id,
      action: AUDIT.USER_ROLE_CHANGED,
      entityType: "User",
      entityId: targetId,
      metadata: { from: before?.role ?? null, to: updated.role },
    });
  }
  return updated;
}

export async function setUserActive(
  session: SessionLike,
  repo: UserRepo,
  targetId: string,
  active: boolean,
  audit?: AuditWriter,
) {
  const me = admin(session);
  if (!active && targetId === me.id) {
    throw new UserError("SELF_CHANGE", "You cannot deactivate yourself");
  }
  const updated = await repo.update(targetId, { active });
  if (!updated) throw new UserError("NOT_FOUND", "User not found");
  await audit?.({
    actorId: me.id,
    action: active ? AUDIT.USER_ACTIVATED : AUDIT.USER_DEACTIVATED,
    entityType: "User",
    entityId: targetId,
  });
  return updated;
}
