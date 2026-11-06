import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AuditEntry } from "./actions";
import { sanitizeAuditMetadata } from "./sanitize";
import type { AuditQuery, AuditReadRepo, AuditRow } from "./service";

/**
 * The only code that touches the AuditLog table. It offers create and read operations and
 * nothing else: there is no update, delete or upsert anywhere in the application.
 */

const where = (q: AuditQuery): Prisma.AuditLogWhereInput => ({
  ...(q.action ? { action: q.action } : {}),
  ...(q.actorId ? { actorId: q.actorId } : {}),
  ...(q.from || q.toExclusive
    ? {
        createdAt: {
          ...(q.from ? { gte: q.from } : {}),
          ...(q.toExclusive ? { lt: q.toExclusive } : {}),
        },
      }
    : {}),
});

const include = { actor: { select: { name: true } } } satisfies Prisma.AuditLogInclude;

function toRow(r: Prisma.AuditLogGetPayload<{ include: typeof include }>): AuditRow {
  return {
    id: r.id,
    createdAt: r.createdAt,
    actorId: r.actorId,
    actorName: r.actor?.name ?? null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata,
  };
}

export const auditRepo: AuditReadRepo & {
  create(entry: AuditEntry): Promise<void>;
  countByAction(action: string, from: Date, toExclusive: Date): Promise<number>;
} = {
  async create(entry) {
    const metadata = sanitizeAuditMetadata(entry.metadata);
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async list(q) {
    const w = where(q);
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: w,
        include,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where: w }),
    ]);
    return { rows: rows.map(toRow), total };
  },

  async listForExport(q, limit) {
    const rows = await prisma.auditLog.findMany({
      where: where(q),
      include,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toRow);
  },

  /** Entries of one action inside a half-open date range, for the analytics page. */
  countByAction(action: string, from: Date, toExclusive: Date) {
    return prisma.auditLog.count({ where: where({ action, from, toExclusive }) });
  },

  async actors() {
    const rows = await prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows;
  },

  async actions() {
    const rows = await prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });
    return rows.map((r) => r.action);
  },
};

/** The audit writer used across the app. */
export const writeAudit = (entry: AuditEntry) => auditRepo.create(entry);
