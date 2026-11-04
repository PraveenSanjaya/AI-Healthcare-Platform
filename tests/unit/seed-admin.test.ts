import { describe, expect, it, vi } from "vitest";
import { seedAdmin, type AdminUpsert } from "@/lib/seed/admin";
import { verifyPassword } from "@/lib/auth/password";

const env = { SEED_ADMIN_EMAIL: " Admin@Clinic.Test ", SEED_ADMIN_PASSWORD: "Valid-Passw0rd-ok" };
const okUpsert = () => vi.fn<AdminUpsert>(async ({ email }) => ({ id: "a1", email }));

describe("seedAdmin", () => {
  it("upserts a normalised, hashed ADMIN and never overwrites an existing password", async () => {
    const upsert = okUpsert();
    const res = await seedAdmin(env, upsert);
    expect(res.email).toBe("admin@clinic.test");
    const arg = upsert.mock.calls[0][0];
    expect(arg.create.role).toBe("ADMIN");
    expect(arg.create.passwordHash).not.toContain(env.SEED_ADMIN_PASSWORD);
    expect(await verifyPassword(env.SEED_ADMIN_PASSWORD, arg.create.passwordHash)).toBe(true);
    expect(arg.update).toEqual({ role: "ADMIN", active: true });
    expect(arg.update).not.toHaveProperty("passwordHash");
  });
  it("is idempotent: repeated runs issue the same keyed upsert", async () => {
    const upsert = okUpsert();
    await seedAdmin(env, upsert);
    await seedAdmin(env, upsert);
    expect(upsert.mock.calls[0][0].email).toBe(upsert.mock.calls[1][0].email);
  });
  it("refuses a missing/invalid email or a weak placeholder password", async () => {
    const upsert = okUpsert();
    await expect(seedAdmin({ ...env, SEED_ADMIN_EMAIL: undefined }, upsert)).rejects.toThrow(
      /SEED_ADMIN_EMAIL/,
    );
    await expect(seedAdmin({ ...env, SEED_ADMIN_PASSWORD: "change-me" }, upsert)).rejects.toThrow(
      /SEED_ADMIN_PASSWORD/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
