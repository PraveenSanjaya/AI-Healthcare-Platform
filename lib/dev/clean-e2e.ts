/**
 * Removes what the Playwright suite creates, with its data. Dev databases only.
 *
 * It selects exactly two kinds of rows, so the admin account and real data cannot be matched:
 *  - STAFF or MANAGER users whose email is e2e-staff@clinic.local, e2e-manager@clinic.local
 *    or the same with a -<suffix>
 *  - the template with the slug e2e-sandbox-template
 */

const E2E_EMAIL = /^e2e-(?:staff|manager)(?:-[a-z0-9]+)?@clinic\.local$/i;
export const E2E_SANDBOX_SLUG = "e2e-sandbox-template";

export type CandidateUser = { id: string; email: string; role: string };
export type CandidateTemplate = { id: string; slug: string };

export type CleanPlan = { userIds: string[]; templateIds: string[] };

export type CleanCounts = {
  users: number;
  templates: number;
  generations: number;
  refinements: number;
  auditLogs: number;
};

export type CleanDb = {
  findUsers(): Promise<CandidateUser[]>;
  findTemplates(): Promise<CandidateTemplate[]>;
  count(plan: CleanPlan): Promise<CleanCounts>;
  /** Delete in dependency order, in one transaction; returns what was removed. */
  remove(plan: CleanPlan): Promise<CleanCounts>;
};

/** The e2e accounts are STAFF or MANAGER; an ADMIN is never matched, whatever its email. */
export const isE2eStaff = (u: CandidateUser) =>
  (u.role === "STAFF" || u.role === "MANAGER") && E2E_EMAIL.test(u.email);
export const isE2eSandbox = (t: CandidateTemplate) => t.slug === E2E_SANDBOX_SLUG;

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

export type CleanResult = {
  users: string[];
  templates: string[];
  counts: CleanCounts;
  dryRun: boolean;
};

export async function cleanE2eData(
  db: CleanDb,
  opts: { dryRun?: boolean; protectedEmails?: string[] } = {},
): Promise<CleanResult> {
  const protectedSet = new Set((opts.protectedEmails ?? []).map((e) => e.toLowerCase()));
  const users = (await db.findUsers()).filter(
    (u) => isE2eStaff(u) && !protectedSet.has(u.email.toLowerCase()),
  );
  const templates = (await db.findTemplates()).filter(isE2eSandbox);
  const plan: CleanPlan = {
    userIds: users.map((u) => u.id),
    templateIds: templates.map((t) => t.id),
  };
  const dryRun = Boolean(opts.dryRun);
  if (plan.userIds.length === 0 && plan.templateIds.length === 0) {
    return {
      users: [],
      templates: [],
      counts: { users: 0, templates: 0, generations: 0, refinements: 0, auditLogs: 0 },
      dryRun,
    };
  }
  const counts = dryRun ? await db.count(plan) : await db.remove(plan);
  return {
    users: users.map((u) => u.email),
    templates: templates.map((t) => t.slug),
    counts,
    dryRun,
  };
}
