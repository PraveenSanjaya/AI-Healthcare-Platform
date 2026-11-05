import { prisma } from "@/lib/db/prisma";
import type { Prisma, Role } from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { AdminTemplateDetail, AdminTemplateRepo } from "./admin-service";
import type { TemplateContent, TemplateInput } from "./editor";
import { variableSchema } from "./types";

const variables = z.array(variableSchema);
const toJson = (v: unknown) => v as Prisma.InputJsonValue;

const versionData = (i: TemplateInput) => ({
  role: i.role,
  context: i.context,
  task: i.task,
  constraints: i.constraints,
  outputFormat: i.outputFormat,
  variables: toJson(i.variables),
  maxWords: i.maxWords,
  maxChars: i.maxChars,
});

async function categoryId(slug: string) {
  const c = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (!c) throw new Error(`Unknown category ${slug}`);
  return c.id;
}

export const prismaAdminTemplateRepo: AdminTemplateRepo = {
  async listAll() {
    const rows = await prisma.template.findMany({
      include: { category: true, currentVersion: { select: { version: true } } },
      orderBy: { title: "asc" },
    });
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      categoryName: t.category.name,
      audience: t.audience,
      archived: t.archived,
      currentVersion: t.currentVersion?.version ?? null,
    }));
  },

  async getBySlug(slug): Promise<AdminTemplateDetail | null> {
    const t = await prisma.template.findUnique({
      where: { slug },
      include: {
        category: true,
        currentVersion: true,
        versions: {
          orderBy: { version: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
      },
    });
    if (!t) return null;
    const cur = t.currentVersion ?? t.versions[0];
    if (!cur) return null;
    const asContent = (v: typeof cur): TemplateContent => ({
      role: v.role,
      context: v.context,
      task: v.task,
      constraints: v.constraints,
      outputFormat: v.outputFormat,
      variables: variables.parse(v.variables),
      maxWords: v.maxWords,
      maxChars: v.maxChars,
    });
    return {
      id: t.id,
      slug: t.slug,
      archived: t.archived,
      currentVersion: cur.version,
      input: {
        categorySlug: t.category.slug,
        title: t.title,
        description: t.description,
        audience: t.audience,
        allowedRoles: t.allowedRoles,
        role: cur.role,
        context: cur.context,
        task: cur.task,
        constraints: cur.constraints,
        outputFormat: cur.outputFormat,
        variables: variables.parse(cur.variables),
        maxWords: cur.maxWords,
        maxChars: cur.maxChars,
      },
      versions: t.versions.map((v) => ({
        version: v.version,
        createdAt: v.createdAt,
        createdByName: v.createdBy?.name ?? null,
        content: asContent(v),
      })),
    };
  },

  categories() {
    return prisma.category.findMany({
      select: { slug: true, name: true },
      orderBy: { order: "asc" },
    });
  },

  async create(slug, input, userId) {
    const catId = await categoryId(input.categorySlug);
    return prisma.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: {
          slug,
          categoryId: catId,
          title: input.title,
          description: input.description,
          audience: input.audience,
          allowedRoles: input.allowedRoles as Role[],
        },
        select: { id: true },
      });
      const v = await tx.templateVersion.create({
        data: { templateId: t.id, version: 1, createdById: userId, ...versionData(input) },
        select: { id: true },
      });
      await tx.template.update({ where: { id: t.id }, data: { currentVersionId: v.id } });
      return { id: t.id };
    });
  },

  async updateMeta(id, input) {
    await prisma.template.update({
      where: { id },
      data: {
        categoryId: await categoryId(input.categorySlug),
        title: input.title,
        description: input.description,
        audience: input.audience,
        allowedRoles: input.allowedRoles as Role[],
      },
    });
  },

  addVersion(id, input, userId) {
    return prisma.$transaction(async (tx) => {
      const max = await tx.templateVersion.aggregate({
        where: { templateId: id },
        _max: { version: true },
      });
      const next = (max._max.version ?? 0) + 1;
      const v = await tx.templateVersion.create({
        data: { templateId: id, version: next, createdById: userId, ...versionData(input) },
        select: { id: true },
      });
      await tx.template.update({ where: { id }, data: { currentVersionId: v.id } });
      return next;
    });
  },

  async setArchived(id, archived) {
    await prisma.template.update({ where: { id }, data: { archived } });
  },
};
