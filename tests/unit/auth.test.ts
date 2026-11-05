import { describe, expect, it, vi } from "vitest";
import { hasRole, isRole } from "@/lib/auth/roles";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUserSchema, loginSchema, passwordSchema } from "@/lib/auth/schemas";
import { AuthError, requireRole, requireUser } from "@/lib/auth/guards";
import { decideAccess } from "@/lib/auth/route-access";
import {
  authorizeCredentials,
  type AuthUserRecord,
  type FindUserByEmail,
} from "@/lib/auth/authorize";

const GOOD_PW = "Valid-Passw0rd-ok";

describe("roles", () => {
  it("orders ADMIN > MANAGER > STAFF", () => {
    expect(hasRole("ADMIN", "MANAGER")).toBe(true);
    expect(hasRole("MANAGER", "ADMIN")).toBe(false);
    expect(hasRole("STAFF", "STAFF")).toBe(true);
  });
  it("rejects unknown roles", () => {
    expect(isRole("ROOT")).toBe(false);
    expect(hasRole(undefined, "STAFF")).toBe(false);
  });
});

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const h = await hashPassword(GOOD_PW);
    expect(h).not.toContain(GOOD_PW);
    expect(await verifyPassword(GOOD_PW, h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("returns false for a malformed hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("schemas", () => {
  it("normalises login email", () => {
    expect(loginSchema.parse({ email: "  A@B.com ", password: "x" }).email).toBe("a@b.com");
  });
  it("rejects bad email / empty password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
  it("enforces password strength", () => {
    expect(passwordSchema.safeParse("short1A").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse(GOOD_PW).success).toBe(true);
  });
  it("defaults new users to STAFF and rejects bad roles", () => {
    const base = { name: "A", email: "a@b.com", password: GOOD_PW };
    expect(createUserSchema.parse(base).role).toBe("STAFF");
    expect(createUserSchema.safeParse({ ...base, role: "ROOT" }).success).toBe(false);
  });
});

describe("guards", () => {
  it("requireUser throws UNAUTHENTICATED without a valid session", () => {
    expect(() => requireUser(null)).toThrow(AuthError);
    expect(() => requireUser({ user: { id: "1", role: "bogus" } })).toThrow(/UNAUTHENTICATED/);
  });
  it("requireRole throws FORBIDDEN for insufficient role", () => {
    expect(() => requireRole({ user: { id: "1", role: "STAFF" } }, "ADMIN")).toThrow(/FORBIDDEN/);
    expect(requireRole({ user: { id: "1", role: "ADMIN" } }, "MANAGER")).toEqual({
      id: "1",
      role: "ADMIN",
    });
  });
});

describe("route access", () => {
  it("API paths answer 401 instead of redirecting when signed out", () => {
    expect(decideAccess("/api/generate", null)).toEqual({ action: "unauthorized" });
    expect(decideAccess("/api/generate", "STAFF")).toEqual({ action: "allow" });
    expect(decideAccess("/api/auth/session", null)).toEqual({ action: "allow" });
  });
  it("sends anonymous users to login with callback", () => {
    expect(decideAccess("/dashboard", null)).toEqual({
      action: "redirect",
      to: "/login?callbackUrl=%2Fdashboard",
    });
  });
  it("allows public paths and bounces signed-in users off /login", () => {
    expect(decideAccess("/", null)).toEqual({ action: "allow" });
    expect(decideAccess("/api/auth/session", null)).toEqual({ action: "allow" });
    expect(decideAccess("/login", "STAFF")).toEqual({ action: "redirect", to: "/dashboard" });
  });
  it("restricts /admin to ADMIN", () => {
    expect(decideAccess("/admin/users", "MANAGER")).toEqual({ action: "forbidden" });
    expect(decideAccess("/admin/users", "ADMIN")).toEqual({ action: "allow" });
    expect(decideAccess("/administrator", "STAFF")).toEqual({ action: "allow" });
  });
});

describe("authorizeCredentials", () => {
  const base: AuthUserRecord = {
    id: "u1",
    name: "Ann",
    email: "ann@x.com",
    passwordHash: "",
    role: "MANAGER",
    active: true,
  };
  async function finder(over: Partial<AuthUserRecord> = {}) {
    const user = { ...base, passwordHash: await hashPassword(GOOD_PW), ...over };
    return vi.fn<FindUserByEmail>(async () => user);
  }
  it("returns the user on valid credentials", async () => {
    const find = await finder();
    const r = await authorizeCredentials({ email: "ANN@x.com", password: GOOD_PW }, find);
    expect(r).toEqual({ id: "u1", name: "Ann", email: "ann@x.com", role: "MANAGER" });
    expect(find).toHaveBeenCalledWith("ann@x.com");
  });
  it("rejects wrong password, inactive user, unknown user, bad input", async () => {
    expect(
      await authorizeCredentials({ email: "ann@x.com", password: "nope" }, await finder()),
    ).toBeNull();
    expect(
      await authorizeCredentials(
        { email: "ann@x.com", password: GOOD_PW },
        await finder({ active: false }),
      ),
    ).toBeNull();
    expect(
      await authorizeCredentials({ email: "a@b.com", password: "x" }, async () => null),
    ).toBeNull();
    const find = vi.fn();
    expect(await authorizeCredentials({ email: "bad" }, find)).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
