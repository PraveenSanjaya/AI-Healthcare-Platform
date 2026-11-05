import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import {
  cleanE2eData,
  isLocalDatabaseUrl,
  type CleanDb,
  type CleanPlan,
} from "../lib/dev/clean-e2e";

/** Generations written by the e2e users, or run on the e2e sandbox template. */
const generationWhere = (plan: CleanPlan) => ({
  OR: [
    { userId: { in: plan.userIds } },
    { templateVersion: { templateId: { in: plan.templateIds } } },
  ],
});

const db: CleanDb = {
  findUsers: () =>
    prisma.user.findMany({
      where: {
        email: { startsWith: "e2e-", endsWith: "@clinic.local" },
        role: { in: ["STAFF", "MANAGER"] },
      },
      select: { id: true, email: true, role: true },
    }),

  findTemplates: () =>
    prisma.template.findMany({
      where: { slug: { startsWith: "e2e-sandbox" } },
      select: { id: true, slug: true },
    }),

  async count(plan) {
    const gens = await prisma.generation.findMany({
      where: generationWhere(plan),
      select: { id: true },
    });
    const genIds = gens.map((g) => g.id);
    const [refinements, auditLogs] = await Promise.all([
      prisma.generationRefinement.count({ where: { generationId: { in: genIds } } }),
      prisma.auditLog.count({ where: auditWhere(plan, genIds) }),
    ]);
    return {
      users: plan.userIds.length,
      templates: plan.templateIds.length,
      generations: genIds.length,
      refinements,
      auditLogs,
    };
  },

  remove: (plan) =>
    prisma.$transaction(async (tx) => {
      const gens = await tx.generation.findMany({
        where: generationWhere(plan),
        select: { id: true },
      });
      const genIds = gens.map((g) => g.id);
      const refinements = await tx.generationRefinement.count({
        where: { generationId: { in: genIds } },
      });
      // Audit rows reference users, so they go first; refinements go with their generation.
      const auditLogs = await tx.auditLog.deleteMany({ where: auditWhere(plan, genIds) });
      await tx.generation.deleteMany({ where: { id: { in: genIds } } });
      // A template points at its current version, so unlink before deleting it (versions cascade).
      await tx.template.updateMany({
        where: { id: { in: plan.templateIds } },
        data: { currentVersionId: null },
      });
      const templates = await tx.template.deleteMany({ where: { id: { in: plan.templateIds } } });
      const users = await tx.user.deleteMany({ where: { id: { in: plan.userIds } } });
      return {
        users: users.count,
        templates: templates.count,
        generations: genIds.length,
        refinements,
        auditLogs: auditLogs.count,
      };
    }),
};

function auditWhere(plan: CleanPlan, genIds: string[]) {
  return {
    OR: [
      { actorId: { in: plan.userIds } },
      { entityType: "Generation", entityId: { in: genIds } },
      { entityType: "Template", entityId: { in: plan.templateIds } },
    ],
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error("Refusing to run: DATABASE_URL is not a database on this machine.");
  }
  const result = await cleanE2eData(db, {
    dryRun,
    protectedEmails: [process.env.SEED_ADMIN_EMAIL ?? ""],
  });
  if (result.users.length === 0 && result.templates.length === 0) {
    console.log("No e2e data found. Nothing to do.");
    return;
  }
  const verb = result.dryRun ? "Would delete" : "Deleted";
  console.log(
    `${verb} ${result.users.length} e2e user(s) and ${result.templates.length} template(s):`,
  );
  for (const email of result.users) console.log(`  - user ${email}`);
  for (const slug of result.templates) console.log(`  - template ${slug}`);
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
