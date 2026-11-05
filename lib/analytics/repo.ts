import { prisma } from "@/lib/db/prisma";
import { AUDIT } from "@/lib/audit/actions";
import { auditRepo } from "@/lib/audit/repo";
import type { AnalyticsRepo, Range } from "./service";

const created = (r: Range) => ({ createdAt: { gte: r.fromDate, lt: r.toExclusive } });

/** Every figure is a database aggregate (GROUP BY, COUNT, SUM, AVG); no rows are loaded to be counted. */
export const prismaAnalyticsRepo: AnalyticsRepo = {
  async perTemplate(r) {
    const groups = await prisma.generation.groupBy({
      by: ["templateVersionId"],
      where: created(r),
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const versions = await prisma.templateVersion.findMany({
      where: { id: { in: groups.map((g) => g.templateVersionId) } },
      select: { id: true, template: { select: { slug: true, title: true } } },
    });
    const byVersion = new Map(versions.map((v) => [v.id, v.template]));
    const totals = new Map<string, { slug: string; title: string; count: number }>();
    for (const g of groups) {
      const t = byVersion.get(g.templateVersionId);
      if (!t) continue;
      const cur = totals.get(t.slug) ?? { slug: t.slug, title: t.title, count: 0 };
      cur.count += g._count._all;
      totals.set(t.slug, cur);
    }
    return [...totals.values()];
  },

  async perUser(r) {
    const groups = await prisma.generation.groupBy({
      by: ["userId"],
      where: created(r),
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: groups.map((g) => g.userId) } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return groups.map((g) => ({
      userId: g.userId,
      name: names.get(g.userId) ?? "Unknown",
      count: g._count._all,
    }));
  },

  perDay(r) {
    return prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "Generation"
      WHERE "createdAt" >= ${r.fromDate} AND "createdAt" < ${r.toExclusive}
      GROUP BY 1
      ORDER BY 1`;
  },

  async phiCounts(r) {
    const [blocked, overrides] = await Promise.all([
      auditRepo.countByAction(AUDIT.PHI_BLOCKED, r.fromDate, r.toExclusive),
      auditRepo.countByAction(AUDIT.PHI_OVERRIDE, r.fromDate, r.toExclusive),
    ]);
    return { blocked, overrides };
  },

  async patientFacingReview(r) {
    const base = {
      ...created(r),
      templateVersion: { template: { audience: "PATIENT_FACING" as const } },
    };
    const [total, reviewed] = await Promise.all([
      prisma.generation.count({ where: base }),
      prisma.generation.count({ where: { ...base, reviewed: true } }),
    ]);
    return { total, reviewed };
  },

  async avgOutputChars(r) {
    const rows = await prisma.$queryRaw<{ avg: number | null }[]>`
      SELECT avg(length("output"))::float8 AS avg
      FROM "Generation"
      WHERE "createdAt" >= ${r.fromDate} AND "createdAt" < ${r.toExclusive}`;
    return rows[0]?.avg ?? null;
  },

  async tokensByModel(r) {
    const groups = await prisma.generation.groupBy({
      by: ["model"],
      where: created(r),
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return groups.map((g) => ({
      model: g.model,
      generations: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
    }));
  },
};
