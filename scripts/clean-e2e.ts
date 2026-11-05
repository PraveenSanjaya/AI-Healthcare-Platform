import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { cleanE2eData, isLocalDatabaseUrl, type CleanDb } from "../lib/dev/clean-e2e";

const db: CleanDb = {
  findCandidates: () =>
    prisma.user.findMany({
      where: { email: { startsWith: "e2e-staff", endsWith: "@clinic.local" }, role: "STAFF" },
      select: { id: true, email: true, role: true },
    }),

  async count(ids) {
    const [generations, refinements, auditLogs] = await Promise.all([
      prisma.generation.count({ where: { userId: { in: ids } } }),
      prisma.generationRefinement.count({ where: { generation: { userId: { in: ids } } } }),
      prisma.auditLog.count({ where: { actorId: { in: ids } } }),
    ]);
    return { users: ids.length, generations, refinements, auditLogs };
  },

  remove: (ids) =>
    prisma.$transaction(async (tx) => {
      const refinements = await tx.generationRefinement.count({
        where: { generation: { userId: { in: ids } } },
      });
      // Audit rows reference users, so they go first; refinements go with their generation.
      const auditLogs = await tx.auditLog.deleteMany({ where: { actorId: { in: ids } } });
      const generations = await tx.generation.deleteMany({ where: { userId: { in: ids } } });
      const users = await tx.user.deleteMany({ where: { id: { in: ids } } });
      return {
        users: users.count,
        generations: generations.count,
        refinements,
        auditLogs: auditLogs.count,
      };
    }),
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error("Refusing to run: DATABASE_URL is not a database on this machine.");
  }
  const result = await cleanE2eData(db, {
    dryRun,
    protectedEmails: [process.env.SEED_ADMIN_EMAIL ?? ""],
  });
  if (result.users.length === 0) {
    console.log("No e2e users found. Nothing to do.");
    return;
  }
  console.log(`${result.dryRun ? "Would delete" : "Deleted"} ${result.users.length} e2e user(s):`);
  for (const email of result.users) console.log(`  - ${email}`);
  const c = result.counts;
  console.log(
    `${result.dryRun ? "Would remove" : "Removed"}: ${c.generations} generations, ` +
      `${c.refinements} refinements, ${c.auditLogs} audit rows.`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
