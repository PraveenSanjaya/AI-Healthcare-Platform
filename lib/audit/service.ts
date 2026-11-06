import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { isCalendarDate } from "@/lib/dates";
import { AUDIT, type AuditWriter } from "./actions";

export const AUDIT_PAGE_SIZE = 50;
/** The CSV export stops here, and says so, so one request cannot dump the whole table. */
export const AUDIT_EXPORT_LIMIT = 10_000;

export type AuditRow = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
};

export type AuditQuery = {
  action?: string;
  actorId?: string;
  from?: Date;
  toExclusive?: Date;
};

/**
 * Read side of the audit log. There is deliberately no update or delete here, nor in the Prisma
 * implementation (lib/audit/repo.ts): the log is append-only.
 */
export type AuditReadRepo = {
  list(
    q: AuditQuery & { page: number; pageSize: number },
  ): Promise<{ rows: AuditRow[]; total: number }>;
  listForExport(q: AuditQuery, limit: number): Promise<AuditRow[]>;
  actors(): Promise<{ id: string; name: string }[]>;
  actions(): Promise<string[]>;
};

export type AuditFilters = {
  action?: string;
  actor?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  page: number;
};

const day = z.string().refine(isCalendarDate, "Not a real date");
const filterSchema = z.object({
  action: z.string().regex(/^[A-Z_]{2,60}$/),
  actor: z.string().min(1).max(100),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).max(100_000),
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parse URL search params; anything invalid is ignored rather than rejected. */
export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const out: AuditFilters = { page: 1 };
  for (const key of ["action", "actor", "from", "to", "page"] as const) {
    const raw = first(params[key])?.trim();
    if (!raw) continue;
    const r = filterSchema.shape[key].safeParse(raw);
    if (r.success) (out as Record<string, unknown>)[key] = r.data;
  }
  return out;
}

const startOfDay = (d: string) => new Date(`${d}T00:00:00.000Z`);
const nextDay = (d: string) => new Date(startOfDay(d).getTime() + 86_400_000);

export function toQuery(f: AuditFilters): AuditQuery {
  return {
    action: f.action,
    actorId: f.actor,
    from: f.from ? startOfDay(f.from) : undefined,
    toExclusive: f.to ? nextDay(f.to) : undefined,
  };
}

type SessionLike = Parameters<typeof requireRole>[0];

export async function listAudit(session: SessionLike, repo: AuditReadRepo, f: AuditFilters) {
  requireRole(session, "ADMIN");
  const [{ rows, total }, actors, actions] = await Promise.all([
    repo.list({ ...toQuery(f), page: f.page, pageSize: AUDIT_PAGE_SIZE }),
    repo.actors(),
    repo.actions(),
  ]);
  return {
    rows,
    total,
    page: f.page,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    actors,
    actions,
  };
}

// ---------- CSV ----------

/** Quote a cell, and defuse spreadsheet formulas (a leading = + - @ tab or CR). */
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = [
  "id",
  "createdAt",
  "actorId",
  "actorName",
  "action",
  "entityType",
  "entityId",
  "metadata",
];

export function buildAuditCsv(rows: AuditRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        r.actorId,
        r.actorName,
        r.action,
        r.entityType,
        r.entityId,
        r.metadata ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** ADMIN only. The export is itself audited (AUDIT_EXPORTED), with the filters and row count. */
export async function exportAuditCsv(
  session: SessionLike,
  deps: { repo: AuditReadRepo; audit: AuditWriter; now: () => Date },
  f: AuditFilters,
) {
  const user = requireRole(session, "ADMIN");
  const rows = await deps.repo.listForExport(toQuery(f), AUDIT_EXPORT_LIMIT);
  await deps.audit({
    actorId: user.id,
    action: AUDIT.AUDIT_EXPORTED,
    entityType: "AuditLog",
    metadata: {
      rows: rows.length,
      truncated: rows.length >= AUDIT_EXPORT_LIMIT,
      filters: {
        action: f.action ?? null,
        actor: f.actor ?? null,
        from: f.from ?? null,
        to: f.to ?? null,
      },
    },
  });
  const stamp = deps.now().toISOString().slice(0, 10);
  return { csv: buildAuditCsv(rows), filename: `audit-log-${stamp}.csv`, count: rows.length };
}
