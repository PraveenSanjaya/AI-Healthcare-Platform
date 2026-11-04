import { describe, expect, it, vi } from "vitest";
import { REVALIDATE_MS, revalidateToken, type LookupUser } from "@/lib/auth/revalidate";

const NOW = 1_000_000;
const lookup = (u: Awaited<ReturnType<LookupUser>>) => vi.fn<LookupUser>(async () => u);

describe("revalidateToken", () => {
  it("skips the DB while the check is fresh (cache <60s)", async () => {
    const l = lookup({ role: "ADMIN", active: true });
    const t = { id: "u1", role: "STAFF", checkedAt: NOW - (REVALIDATE_MS - 1) };
    expect(await revalidateToken(t, l, NOW)).toBe(t);
    expect(l).not.toHaveBeenCalled();
  });
  it("re-checks after 60s and applies a changed role", async () => {
    const l = lookup({ role: "MANAGER", active: true });
    const t = { id: "u1", role: "STAFF", checkedAt: NOW - REVALIDATE_MS };
    expect(await revalidateToken(t, l, NOW)).toMatchObject({ role: "MANAGER", checkedAt: NOW });
    expect(l).toHaveBeenCalledWith("u1");
  });
  it("drops the session for a deactivated user", async () => {
    const t = { id: "u1", role: "STAFF", checkedAt: 0 };
    expect(await revalidateToken(t, lookup({ role: "STAFF", active: false }), NOW)).toBeNull();
  });
  it("drops the session for a deleted user or invalid role", async () => {
    const t = { id: "u1", role: "STAFF", checkedAt: 0 };
    expect(await revalidateToken(t, lookup(null), NOW)).toBeNull();
    expect(await revalidateToken(t, lookup({ role: "ROOT", active: true }), NOW)).toBeNull();
  });
  it("checks tokens that predate checkedAt, and rejects tokens without an id", async () => {
    const l = lookup({ role: "STAFF", active: true });
    expect(await revalidateToken({ id: "u1" }, l, NOW)).toMatchObject({ checkedAt: NOW });
    expect(await revalidateToken({}, l, NOW)).toBeNull();
  });
  it("propagates lookup errors (fails closed)", async () => {
    const l = vi.fn<LookupUser>(async () => {
      throw new Error("db down");
    });
    await expect(revalidateToken({ id: "u1" }, l, NOW)).rejects.toThrow("db down");
  });
});
