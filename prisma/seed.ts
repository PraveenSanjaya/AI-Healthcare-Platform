import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { seedAdmin } from "../lib/seed/admin";
import { seedTemplates, type SeedDb, type VersionContent } from "../lib/seed/templates";
import { CATEGORIES, TEMPLATES } from "./seed-data/templates";
import type { Prisma } from "../lib/generated/prisma/client";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;

function prismaSeedDb(tx: Prisma.TransactionClient): SeedDb {
  return {
    async upsertCategory(c) {
      const row = await tx.category.upsert({
        where: { slug: c.slug },
        create: c,
        update: { name: c.name, order: c.order },
      });
      return row.id;
    },
    async findTemplate(slug) {
      const t = await tx.template.findUnique({
        where: { slug },
        include: { currentVersion: true },
      });
      if (!t) return null;
      const latest = await tx.templateVersion.aggregate({
        where: { templateId: t.id },
        _max: { version: true },
      });
      const cv = t.currentVersion;
      return {
        id: t.id,
        latestVersion: latest._max.version ?? 0,
        current: cv
          ? {
              content: {
                role: cv.role,
                context: cv.context,
                task: cv.task,
                constraints: cv.constraints,
                outputFormat: cv.outputFormat,
                variables: cv.variables,
                maxWords: cv.maxWords,
                maxChars: cv.maxChars,
              },
            }
          : null,
      };
    },
    async createTemplate(slug, meta) {
      return (await tx.template.create({ data: { slug, ...meta }, select: { id: true } })).id;
    },
    async updateTemplate(id, meta) {
      await tx.template.update({ where: { id }, data: meta });
    },
    async addVersion(templateId, version, c: VersionContent) {
      const v = await tx.templateVersion.create({
        data: { templateId, version, ...c, variables: toJson(c.variables) },
        select: { id: true },
      });
      await tx.template.update({ where: { id: templateId }, data: { currentVersionId: v.id } });
    },
  };
}

async function main() {
  const admin = await seedAdmin(process.env, ({ email, create, update }) =>
    prisma.user.upsert({ where: { email }, create, update, select: { id: true, email: true } }),
  );
  console.log(`Admin ready: ${admin.email}`);

  const summary = await prisma.$transaction((tx) =>
    seedTemplates(prismaSeedDb(tx), CATEGORIES, TEMPLATES),
  );
  console.log(
    `Templates: ${summary.created} created, ${summary.versioned} new versions, ${summary.unchanged} unchanged`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
