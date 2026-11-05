import { describe, expect, it } from "vitest";
import {
  cleanE2eData,
  isE2eStaff,
  isLocalDatabaseUrl,
  type CandidateUser,
  type CleanDb,
} from "@/lib/dev/clean-e2e";

const u = (email: string, role = "STAFF", id = email): CandidateUser => ({ id, email, role });

function fakeDb(users: CandidateUser[]) {
  const removed: string[][] = [];
  const db: CleanDb = {
    findCandidates: async () => users,
    count: async (ids) => ({ users: ids.length, generations: 5, refinements: 2, auditLogs: 9 }),
    remove: async (ids) => {
      removed.push(ids);
      return { users: ids.length, generations: 5, refinements: 2, auditLogs: 9 };
    },
  };
  return { db, removed };
}

describe("isE2eStaff", () => {
  it("matches the reusable account and timestamped ones", () => {
    expect(isE2eStaff(u("e2e-staff@clinic.local"))).toBe(true);
    expect(isE2eStaff(u("e2e-staff-1762345678901@clinic.local"))).toBe(true);
    expect(isE2eStaff(u("E2E-Staff@Clinic.Local"))).toBe(true);
  });
  it("never matches other people, other domains or lookalikes", () => {
    for (const email of [
      "admin@clinic.local",
      "e2e-staff@example.com",
      "e2e-staffer@clinic.local",
      "real-e2e-staff@clinic.local",
      "e2e-staff-x@clinic.local.evil.com",
      "e2e-staff-a b@clinic.local",
    ]) {
      expect(isE2eStaff(u(email)), email).toBe(false);
    }
  });
  it("never matches a non-STAFF account, even with an e2e email", () => {
    expect(isE2eStaff(u("e2e-staff@clinic.local", "ADMIN"))).toBe(false);
    expect(isE2eStaff(u("e2e-staff-1@clinic.local", "MANAGER"))).toBe(false);
  });
});

describe("isLocalDatabaseUrl", () => {
  it("accepts this machine only", () => {
    expect(isLocalDatabaseUrl("postgres://u:p@localhost:51214/db?sslmode=disable")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("prisma+postgres://localhost:51213/?api_key=x")).toBe(true);
  });
  it("rejects remote, malformed and missing URLs", () => {
    expect(isLocalDatabaseUrl("postgres://u:p@db.example.com:5432/db")).toBe(false);
    expect(isLocalDatabaseUrl("postgres://u:p@localhost.evil.com/db")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
  });
});

describe("cleanE2eData", () => {
  const users = [
    u("admin@clinic.local", "ADMIN"),
    u("e2e-staff@clinic.local"),
    u("e2e-staff-1762345678901@clinic.local"),
    u("nimali@clinic.local"),
  ];

  it("removes only the e2e staff accounts", async () => {
    const { db, removed } = fakeDb(users);
    const r = await cleanE2eData(db);
    expect(r.users).toEqual(["e2e-staff@clinic.local", "e2e-staff-1762345678901@clinic.local"]);
    expect(removed).toEqual([["e2e-staff@clinic.local", "e2e-staff-1762345678901@clinic.local"]]);
    expect(r.counts).toEqual({ users: 2, generations: 5, refinements: 2, auditLogs: 9 });
    expect(r.dryRun).toBe(false);
  });
  it("a dry run counts but removes nothing", async () => {
    const { db, removed } = fakeDb(users);
    const r = await cleanE2eData(db, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.counts.generations).toBe(5);
    expect(removed).toEqual([]);
  });
  it("does nothing when there is nothing to clean", async () => {
    const { db, removed } = fakeDb([u("admin@clinic.local", "ADMIN"), u("nimali@clinic.local")]);
    const r = await cleanE2eData(db);
    expect(r.users).toEqual([]);
    expect(r.counts).toEqual({ users: 0, generations: 0, refinements: 0, auditLogs: 0 });
    expect(removed).toEqual([]);
  });
  it("skips protected emails even if they look like e2e accounts", async () => {
    const { db, removed } = fakeDb(users);
    const r = await cleanE2eData(db, { protectedEmails: ["E2E-staff@clinic.local", ""] });
    expect(r.users).toEqual(["e2e-staff-1762345678901@clinic.local"]);
    expect(removed[0]).toEqual(["e2e-staff-1762345678901@clinic.local"]);
  });
  it("ignores a candidate list that contains non-e2e users", async () => {
    const { db } = fakeDb([u("admin@clinic.local", "ADMIN")]);
    expect((await cleanE2eData(db)).users).toEqual([]);
  });
});
