import { describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/guards";
import { verifyPassword } from "@/lib/auth/password";
import {
  UserError,
  changeRole,
  createUser,
  listUsers,
  setUserActive,
  type UserRepo,
  type UserSummary,
} from "@/lib/users/service";

const admin = { user: { id: "admin1", role: "ADMIN" } };
const manager = { user: { id: "m1", role: "MANAGER" } };
const staff = { user: { id: "s1", role: "STAFF" } };

const summary = (over: Partial<UserSummary> = {}): UserSummary => ({
  id: "u2",
  name: "Bo",
  email: "bo@x.com",
  role: "STAFF",
  active: true,
  createdAt: new Date(0),
  ...over,
});

function repo(over: Partial<UserRepo> = {}): UserRepo {
  return {
    list: vi.fn(async () => [summary()]),
    emailExists: vi.fn(async () => false),
    create: vi.fn(async (d) => summary({ ...d, id: "new" })),
    update: vi.fn(async (id, d) => summary({ id, ...d })),
    ...over,
  };
}

const VALID = { name: "Bo", email: "Bo@x.com", password: "Valid-Passw0rd-ok", role: "MANAGER" };

describe("user service authorisation (403)", () => {
  const cases = [
    ["staff", staff],
    ["manager", manager],
  ] as const;
  for (const [label, session] of cases) {
    it(`${label} is FORBIDDEN on every admin operation and the repo is untouched`, async () => {
      const r = repo();
      const ops = [
        () => listUsers(session, r),
        () => createUser(session, r, VALID),
        () => changeRole(session, r, "u2", "ADMIN"),
        () => setUserActive(session, r, "u2", false),
      ];
      for (const op of ops) {
        await expect(op()).rejects.toMatchObject({ name: "AuthError", code: "FORBIDDEN" });
      }
      expect(r.list).not.toHaveBeenCalled();
      expect(r.create).not.toHaveBeenCalled();
      expect(r.update).not.toHaveBeenCalled();
    });
  }
  it("anonymous callers are UNAUTHENTICATED", async () => {
    await expect(listUsers(null, repo())).rejects.toBeInstanceOf(AuthError);
    await expect(listUsers(null, repo())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("admin operations", () => {
  it("lists users", async () => {
    expect(await listUsers(admin, repo())).toHaveLength(1);
  });
  it("creates a user with a hashed, normalised record", async () => {
    const r = repo();
    await createUser(admin, r, VALID);
    const arg = vi.mocked(r.create).mock.calls[0][0];
    expect(arg.email).toBe("bo@x.com");
    expect(arg.role).toBe("MANAGER");
    expect(arg.passwordHash).not.toContain("Valid-Passw0rd-ok");
    expect(await verifyPassword("Valid-Passw0rd-ok", arg.passwordHash)).toBe(true);
  });
  it("rejects weak passwords and duplicate emails", async () => {
    await expect(createUser(admin, repo(), { ...VALID, password: "weak" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const dup = repo({ emailExists: vi.fn(async () => true) });
    await expect(createUser(admin, dup, VALID)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("changes another user role and rejects unknown roles", async () => {
    const r = repo();
    expect((await changeRole(admin, r, "u2", "MANAGER")).role).toBe("MANAGER");
    await expect(changeRole(admin, r, "u2", "ROOT")).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("reports NOT_FOUND when the target is missing", async () => {
    const r = repo({ update: vi.fn(async () => null) });
    await expect(changeRole(admin, r, "nope", "STAFF")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(setUserActive(admin, r, "nope", true)).rejects.toBeInstanceOf(UserError);
  });
  it("activates and deactivates others", async () => {
    const r = repo();
    expect((await setUserActive(admin, r, "u2", false)).active).toBe(false);
    expect((await setUserActive(admin, r, "u2", true)).active).toBe(true);
  });
});

describe("self-protection", () => {
  it("an admin cannot demote themselves", async () => {
    const r = repo();
    await expect(changeRole(admin, r, "admin1", "STAFF")).rejects.toMatchObject({
      code: "SELF_CHANGE",
    });
    expect(r.update).not.toHaveBeenCalled();
  });
  it("an admin cannot deactivate themselves", async () => {
    const r = repo();
    await expect(setUserActive(admin, r, "admin1", false)).rejects.toMatchObject({
      code: "SELF_CHANGE",
    });
    expect(r.update).not.toHaveBeenCalled();
  });
});
