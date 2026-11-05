import { prisma } from "@/lib/db/prisma";
import type { TemplateRepo, TemplateRow } from "./service";

const include = { category: true, currentVersion: true } as const;

type DbTemplate = NonNullable<Awaited<ReturnType<typeof findOne>>>;
const findOne = (slug: string) => prisma.template.findUnique({ where: { slug }, include });

function toRow(t: DbTemplate): TemplateRow {
  const v = t.currentVersion;
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    audience: t.audience,
    archived: t.archived,
    allowedRoles: t.allowedRoles,
    category: { slug: t.category.slug, name: t.category.name, order: t.category.order },
    current: v
      ? {
          id: v.id,
          role: v.role,
          context: v.context,
          task: v.task,
          constraints: v.constraints,
          outputFormat: v.outputFormat,
          variables: v.variables,
          maxWords: v.maxWords,
          maxChars: v.maxChars,
        }
      : null,
  };
}

export const prismaTemplateRepo: TemplateRepo = {
  async list() {
    const rows = await prisma.template.findMany({
      where: { archived: false },
      include,
      orderBy: { title: "asc" },
    });
    return rows.map(toRow);
  },
  async findBySlug(slug) {
    const t = await findOne(slug);
    return t ? toRow(t) : null;
  },
  async favoriteTemplateIds(userId) {
    const favs = await prisma.favorite.findMany({
      where: { userId },
      select: { templateId: true },
    });
    return favs.map((f) => f.templateId);
  },
  async setFavorite(userId, templateId, on) {
    if (on) {
      await prisma.favorite.upsert({
        where: { userId_templateId: { userId, templateId } },
        create: { userId, templateId },
        update: {},
      });
    } else {
      await prisma.favorite.deleteMany({ where: { userId, templateId } });
    }
  },
};
