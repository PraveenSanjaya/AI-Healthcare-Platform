import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";
import {
  AUDIT_EXPORT_LIMIT,
  AUDIT_PAGE_SIZE,
  buildAuditCsv,
  csvCell,
  exportAuditCsv,
  listAudit,
  parseAuditFilters,
  toQuery,
  type AuditQuery,
  type AuditReadRepo,
  type AuditRow,
} from "@/lib/audit/service";
import { AuthError } from "@/lib/auth/guards";
import { authorizeWithAudit, emailFingerprint } from "@/lib/auth/login-audit";
import { hashPassword } from "@/lib/auth/password";
import { AUDIT, type AuditEntry } from "@/lib/audit/actions";
import {
  UserError,
  changeRole,
  createUser,
  setUserActive,
  type UserRepo,
  type UserSummary,
} from "@/lib/users/service";

describe("sanitizeAuditMetadata", () => {
  it("returns undefined for no metadata and keeps plain ids, counts and flags", () => {
    expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
    expect(
      sanitizeAuditMetadata({ slug: "faq-schema-writer", count: 3, ok: true, none: null }),
    ).toEqual({
      slug: "faq-schema-writer",
      count: 3,
      ok: true,
      none: null,
    });
  });
  it("drops keys that look like raw content or secrets and says so", () => {
    const out = sanitizeAuditMetadata({
      inputs: { a: "b" },
      output: "draft text",
      Prompt: "x",
      password: "p",
      match: "0771234567",
      email: "a@b.lk",
      kept: "yes",
    });
    expect(out).toEqual({
      kept: "yes",
      _dropped: ["inputs", "output", "Prompt", "password", "match", "email"],
    });
  });
  it("redacts personal data in strings that slip through", () => {
    const out = sanitizeAuditMetadata({
      reason: "Call 0771234567 or a@b.lk about DOB: 12/03/1985",
    });
    expect(out?.reason).toBe("Call [REDACTED-PHONE] or [REDACTED-EMAIL] about [REDACTED-DOB]");
  });
  it("truncates long strings, deep nesting and long arrays", () => {
    const out = sanitizeAuditMetadata({
      long: "x".repeat(500),
      list: Array.from({ length: 100 }, (_, i) => i),
      deep: { a: { b: { c: { d: 1 } } } },
    }) as Record<string, unknown>;
    expect((out.long as string).length).toBe(301);
    expect(out.list as number[]).toHaveLength(30);
    expect(JSON.stringify(out.deep)).toContain("[truncated]");
  });
  it("handles dates, undefined, functions and non-finite numbers without throwing", () => {
    const out = sanitizeAuditMetadata({
      at: new Date("2026-11-05T10:00:00Z"),
      u: undefined,
      f: () => 1,
      n: Number.NaN,
    });
    expect(out).toEqual({ at: "2026-11-05T10:00:00.000Z", n: null });
  });
});

describe("the audit log is append-only", () => {
  it("the repository exposes create and read operations only", async () => {
    const { auditRepo } = await import("@/lib/audit/repo");
    const names = Object.keys(auditRepo).sort();
    expect(names).toEqual([
      "actions",
      "actors",
      "countByAction",
      "create",
      "list",
      "listForExport",
    ]);
    for (const n of names)
      expect(n).not.toMatch(/update|delete|remove|upsert|destroy|clear|truncate/i);
  });

  const ROOT = path.resolve(__dirname, "../..");
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        return ["node_modules", ".next", "generated", "tests"].includes(e.name)
          ? []
          : sources(full);
      }
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });
  }

  it("no application code updates or deletes AuditLog rows", () => {
    // scripts/ is the one exemption: the dev-only e2e clean-up deletes its own test rows.
    const files = [
      ...sources(path.join(ROOT, "lib")),
      ...sources(path.join(ROOT, "app")),
      path.join(ROOT, "auth.ts"),
      path.join(ROOT, "proxy.ts"),
    ];
    const bad =
      /auditLog\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b|"AuditLog"\s*(SET|WHERE)|DELETE\s+FROM\s+"?AuditLog/i;
    const offenders = files.filter((f) => bad.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("only the audit repository touches the AuditLog table", () => {
    const files = [...sources(path.join(ROOT, "lib")), ...sources(path.join(ROOT, "app"))];
    const touching = files
      .filter((f) => /prisma\s*\.\s*auditLog\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    expect(touching).toEqual(["lib/audit/repo.ts"]);
  });
});

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: "a1",
  createdAt: new Date("2026-11-05T10:00:00Z"),
  actorId: "u1",
  actorName: "Admin",
  action: "EXPORTED",
  entityType: "Generation",
  entityId: "g1",
  metadata: { format: "pdf" },
  ...over,
});

function readRepo(rows: AuditRow[] = [row()]) {
  const seen: { list?: unknown; export?: [AuditQuery, number] } = {};
  const repo: AuditReadRepo = {
    list: async (q) => {
      seen.list = q;
      return { rows, total: rows.length };
    },
    listForExport: async (q, limit) => {
      seen.export = [q, limit];
      return rows;
    },
    actors: async () => [{ id: "u1", name: "Admin" }],
    actions: async () => ["EXPORTED", "LOGIN_FAILED"],
  };
  return { repo, seen };
}
const as = (role: string) => ({ user: { id: `u-${role}`, role } });

describe("parseAuditFilters / toQuery", () => {
  it("defaults to page 1", () => expect(parseAuditFilters({})).toEqual({ page: 1 }));
  it("reads valid filters and ignores invalid ones", () => {
    expect(
      parseAuditFilters({
        action: "PHI_BLOCKED",
        actor: "cuid1",
        from: "2026-11-01",
        to: "x",
        page: "2",
      }),
    ).toEqual({ action: "PHI_BLOCKED", actor: "cuid1", from: "2026-11-01", page: 2 });
    expect(parseAuditFilters({ action: "drop table", page: "0" })).toEqual({ page: 1 });
  });
  it("ignores impossible calendar dates", () => {
    expect(parseAuditFilters({ from: "2026-13-45", to: "2026-02-30" })).toEqual({ page: 1 });
  });
  it("turns dates into an inclusive range", () => {
    expect(
      toQuery({ from: "2026-11-01", to: "2026-11-05", page: 1, action: "X", actor: "u" }),
    ).toEqual({
      action: "X",
      actorId: "u",
      from: new Date("2026-11-01T00:00:00.000Z"),
      toExclusive: new Date("2026-11-06T00:00:00.000Z"),
    });
  });
});

describe("audit viewer access", () => {
  it("is ADMIN only", async () => {
    const { repo } = readRepo();
    for (const role of ["MANAGER", "STAFF"]) {
      await expect(listAudit(as(role), repo, { page: 1 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(listAudit(null, repo, { page: 1 })).rejects.toBeInstanceOf(AuthError);
  });
  it("lists with filters, page size and the filter options", async () => {
    const { repo, seen } = readRepo();
    const r = await listAudit(as("ADMIN"), repo, { page: 3, action: "EXPORTED" });
    expect(seen.list).toMatchObject({ action: "EXPORTED", page: 3, pageSize: AUDIT_PAGE_SIZE });
    expect(r.actions).toEqual(["EXPORTED", "LOGIN_FAILED"]);
    expect(r.actors).toEqual([{ id: "u1", name: "Admin" }]);
    expect(r.pages).toBe(1);
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it("defuses spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2", "@cmd", "\tx"]) {
      expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("builds a header and one line per row", () => {
    const csv = buildAuditCsv([
      row(),
      row({ id: "a2", actorId: null, actorName: null, metadata: null }),
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("id,createdAt,actorId,actorName,action,entityType,entityId,metadata");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("2026-11-05T10:00:00.000Z");
    expect(lines[1]).toContain('"{""format"":""pdf""}"');
    expect(lines[2].startsWith("a2,2026-11-05T10:00:00.000Z,,,EXPORTED")).toBe(true);
  });
  it("exports for ADMIN only, passes the filters and audits AUDIT_EXPORTED", async () => {
    const { repo, seen } = readRepo([row(), row({ id: "a2" })]);
    const audit: AuditEntry[] = [];
    const deps = {
      repo,
      audit: async (e: AuditEntry) => void audit.push(e),
      now: () => new Date("2026-11-06T00:00:00Z"),
    };
    for (const role of ["MANAGER", "STAFF"]) {
      await expect(exportAuditCsv(as(role), deps, { page: 1 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    expect(audit).toEqual([]);

    const r = await exportAuditCsv(as("ADMIN"), deps, {
      page: 1,
      action: "EXPORTED",
      from: "2026-11-01",
    });
    expect(r.filename).toBe("audit-log-2026-11-06.csv");
    expect(r.count).toBe(2);
    expect(seen.export?.[1]).toBe(AUDIT_EXPORT_LIMIT);
    expect(audit).toEqual([
      {
        actorId: "u-ADMIN",
        action: "AUDIT_EXPORTED",
        entityType: "AuditLog",
        metadata: {
          rows: 2,
          truncated: false,
          filters: { action: "EXPORTED", actor: null, from: "2026-11-01", to: null },
        },
      },
    ]);
  });
});

describe("login audit", () => {
  const hash = hashPassword("Valid-Passw0rd-ok");
  const user = async () => ({
    id: "u1",
    name: "Bo",
    email: "bo@x.com",
    passwordHash: await hash,
    role: "STAFF",
    active: true,
  });

  it("writes LOGIN_SUCCESS with the user and role", async () => {
    const audit: AuditEntry[] = [];
    const u = await authorizeWithAudit(
      { email: "bo@x.com", password: "Valid-Passw0rd-ok" },
      async () => await user(),
      async (e) => void audit.push(e),
    );
    expect(u?.id).toBe("u1");
    expect(audit).toEqual([
      {
        actorId: "u1",
        action: "LOGIN_SUCCESS",
        entityType: "User",
        entityId: "u1",
        metadata: { role: "STAFF" },
      },
    ]);
  });
  it("writes LOGIN_FAILED with a fingerprint, never the email or password", async () => {
    const audit: AuditEntry[] = [];
    const u = await authorizeWithAudit(
      { email: "Bo@X.com", password: "wrong-password-123" },
      async () => await user(),
      async (e) => void audit.push(e),
    );
    expect(u).toBeNull();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: null, action: "LOGIN_FAILED", entityType: "User" });
    const meta = JSON.stringify(audit[0].metadata);
    expect(meta).toContain(emailFingerprint({ email: "bo@x.com" }));
    expect(meta).not.toMatch(/bo@x\.com|wrong-password/i);
  });
  it("audits unknown users, inactive users and malformed input as failures", async () => {
    const audit: AuditEntry[] = [];
    const w = async (e: AuditEntry) => void audit.push(e);
    await authorizeWithAudit(
      { email: "x@y.com", password: "Valid-Passw0rd-ok" },
      async () => null,
      w,
    );
    await authorizeWithAudit(
      { email: "bo@x.com", password: "Valid-Passw0rd-ok" },
      async () => ({ ...(await user()), active: false }),
      w,
    );
    await authorizeWithAudit({ nope: 1 }, async () => null, w);
    expect(audit.map((a) => a.action)).toEqual(["LOGIN_FAILED", "LOGIN_FAILED", "LOGIN_FAILED"]);
    expect((audit[2].metadata as { emailFingerprint: unknown }).emailFingerprint).toBeNull();
  });
  it("never lets an audit failure change the login result", async () => {
    const boom = vi.fn(async () => {
      throw new Error("db down");
    });
    const ok = await authorizeWithAudit(
      { email: "bo@x.com", password: "Valid-Passw0rd-ok" },
      async () => await user(),
      boom,
    );
    expect(ok?.id).toBe("u1");
    const bad = await authorizeWithAudit(
      { email: "bo@x.com", password: "nope-nope-nope-1" },
      async () => await user(),
      boom,
    );
    expect(bad).toBeNull();
    expect(boom).toHaveBeenCalledTimes(2);
  });
  it("fingerprints are stable, case-insensitive and short", () => {
    const a = emailFingerprint({ email: "Bo@X.com " });
    expect(a).toBe(emailFingerprint({ email: "bo@x.com" }));
    expect(a).toHaveLength(12);
    expect(emailFingerprint({ email: "" })).toBeNull();
    expect(emailFingerprint(null)).toBeNull();
  });
});

describe("user management audit", () => {
  const admin = { user: { id: "admin1", role: "ADMIN" } };
  const summary = (over: Partial<UserSummary> = {}): UserSummary => ({
    id: "u2",
    name: "Bo",
    email: "bo@x.com",
    role: "STAFF",
    active: true,
    createdAt: new Date(0),
    ...over,
  });
  const repo = (): UserRepo => ({
    list: async () => [summary()],
    emailExists: async () => false,
    create: async (d) => summary({ id: "new", role: d.role, name: d.name }),
    update: async (id, d) => summary({ id, ...d }),
  });
  const collect = () => {
    const rows: AuditEntry[] = [];
    return { rows, w: async (e: AuditEntry) => void rows.push(e) };
  };

  it("audits user creation with the new id and role, never the email or password", async () => {
    const { rows, w } = collect();
    await createUser(
      admin,
      repo(),
      { name: "Bo", email: "bo@x.com", password: "Valid-Passw0rd-ok", role: "MANAGER" },
      w,
    );
    expect(rows).toEqual([
      {
        actorId: "admin1",
        action: AUDIT.USER_CREATED,
        entityType: "User",
        entityId: "new",
        metadata: { role: "MANAGER" },
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/bo@x\.com|Passw0rd/);
  });
  it("audits a role change with from and to, and nothing when the role is unchanged", async () => {
    const { rows, w } = collect();
    await changeRole(admin, repo(), "u2", "MANAGER", w);
    expect(rows[0]).toMatchObject({
      action: AUDIT.USER_ROLE_CHANGED,
      entityId: "u2",
      metadata: { from: "STAFF", to: "MANAGER" },
    });
    const same = collect();
    await changeRole(admin, repo(), "u2", "STAFF", same.w);
    expect(same.rows).toEqual([]);
  });
  it("audits activate and deactivate", async () => {
    const { rows, w } = collect();
    await setUserActive(admin, repo(), "u2", false, w);
    await setUserActive(admin, repo(), "u2", true, w);
    expect(rows.map((r) => r.action)).toEqual([AUDIT.USER_DEACTIVATED, AUDIT.USER_ACTIVATED]);
  });
  it("writes nothing when the operation is refused", async () => {
    const { rows, w } = collect();
    await expect(changeRole(admin, repo(), "admin1", "STAFF", w)).rejects.toBeInstanceOf(UserError);
    await expect(setUserActive(admin, repo(), "admin1", false, w)).rejects.toBeInstanceOf(
      UserError,
    );
    await expect(
      createUser({ user: { id: "s", role: "STAFF" } }, repo(), {}, w),
    ).rejects.toBeInstanceOf(AuthError);
    expect(rows).toEqual([]);
  });
});
