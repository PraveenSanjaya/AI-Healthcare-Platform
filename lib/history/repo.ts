import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { HistoryDetail, HistoryRepo, HistoryRow } from "./service";

const include = {
  user: { select: { name: true } },
  templateVersion: {
    select: { version: true, template: { select: { slug: true, title: true, audience: true } } },
  },
} satisfies Prisma.GenerationInclude;

type DbGeneration = Prisma.GenerationGetPayload<{ include: typeof include }>;

function toRow(g: DbGeneration): HistoryRow {
  return {
    id: g.id,
    createdAt: g.createdAt,
    userId: g.userId,
    userName: g.user.name,
    templateSlug: g.templateVersion.template.slug,
    templateTitle: g.templateVersion.template.title,
    audience: g.templateVersion.template.audience,
    reviewed: g.reviewed,
    reviewedAt: g.reviewedAt,
  };
}

export const prismaHistoryRepo: HistoryRepo = {
  async list(q) {
    const where: Prisma.GenerationWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.templateSlug ? { templateVersion: { template: { slug: q.templateSlug } } } : {}),
      ...(q.from || q.toExclusive
        ? {
            createdAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.toExclusive ? { lt: q.toExclusive } : {}),
            },
          }
        : {}),
      ...(q.reviewed === undefined ? {} : { reviewed: q.reviewed }),
    };
    const [rows, total] = await Promise.all([
      prisma.generation.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.generation.count({ where }),
    ]);
    return { rows: rows.map(toRow), total };
  },

  async get(id): Promise<HistoryDetail | null> {
    const g = await prisma.generation.findUnique({
      where: { id },
      include: { ...include, refinements: { orderBy: { createdAt: "asc" } } },
    });
    if (!g) return null;
    return {
      ...toRow(g),
      templateVersion: g.templateVersion.version,
      model: g.model,
      inputs: g.inputs as Record<string, string>,
      output: g.output,
      refinements: g.refinements.map((r) => ({
        id: r.id,
        instruction: r.instruction,
        output: r.output,
        createdAt: r.createdAt,
      })),
    };
  },

  templateOptions() {
    return prisma.template.findMany({
      where: { archived: false },
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
    });
  },
};
