/**
 * Removes the accounts created by the Playwright suite, with their data. Dev databases only.
 * Only STAFF users whose email is e2e-staff@clinic.local or e2e-staff-<suffix>@clinic.local
 * are ever selected, so the admin account and real data cannot be matched.
 */

const E2E_EMAIL = /^e2e-staff(?:-[a-z0-9]+)?@clinic\.local$/i;

export type CandidateUser = { id: string; email: string; role: string };

export type CleanCounts = {
  users: number;
  generations: number;
  refinements: number;
  auditLogs: number;
};

export type CleanDb = {
  findCandidates(): Promise<CandidateUser[]>;
  count(userIds: string[]): Promise<CleanCounts>;
  /** Delete in dependency order, in one transaction; returns what was removed. */
  remove(userIds: string[]): Promise<CleanCounts>;
};

export const isE2eStaff = (u: CandidateUser) => u.role === "STAFF" && E2E_EMAIL.test(u.email);

/** True only for a database on this machine. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url.replace(/^prisma\+postgres:/, "postgres:")).hostname;
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
  } catch {
    return false;
  }
}

export type CleanResult = { users: string[]; counts: CleanCounts; dryRun: boolean };

export async function cleanE2eData(
  db: CleanDb,
  opts: { dryRun?: boolean; protectedEmails?: string[] } = {},
): Promise<CleanResult> {
  const protectedSet = new Set((opts.protectedEmails ?? []).map((e) => e.toLowerCase()));
  const users = (await db.findCandidates()).filter(
    (u) => isE2eStaff(u) && !protectedSet.has(u.email.toLowerCase()),
  );
  const ids = users.map((u) => u.id);
  const empty: CleanCounts = { users: 0, generations: 0, refinements: 0, auditLogs: 0 };
  if (ids.length === 0) return { users: [], counts: empty, dryRun: Boolean(opts.dryRun) };
  const counts = opts.dryRun ? await db.count(ids) : await db.remove(ids);
  return { users: users.map((u) => u.email), counts, dryRun: Boolean(opts.dryRun) };
}
