import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { hasRole, type AppRole } from "@/lib/auth/roles";

export const PAGE_SIZE = 20;

export type HistoryRow = {
  id: string;
  createdAt: Date;
  userId: string;
  userName: string;
  templateSlug: string;
  templateTitle: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  reviewed: boolean;
  reviewedAt: Date | null;
};

export type HistoryDetail = HistoryRow & {
  templateVersion: number;
  model: string;
  inputs: Record<string, string>;
  output: string;
  refinements: { id: string; instruction: string; output: string; createdAt: Date }[];
};

/** What the repository filters by. `userId` is set by the service, never by the caller. */
export type HistoryQuery = {
  userId?: string;
  templateSlug?: string;
  from?: Date;
  toExclusive?: Date;
  reviewed?: boolean;
  page: number;
  pageSize: number;
};

export type HistoryRepo = {
  list(q: HistoryQuery): Promise<{ rows: HistoryRow[]; total: number }>;
  get(id: string): Promise<HistoryDetail | null>;
  templateOptions(): Promise<{ slug: string; title: string }[]>;
};

export class HistoryNotFoundError extends Error {
  constructor() {
    super("Generation not found");
    this.name = "HistoryNotFoundError";
  }
}

export type HistoryFilters = {
  template?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  reviewed?: "yes" | "no";
  page: number;
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z.object({
  template: z.string().max(200).optional(),
  from: day.optional(),
  to: day.optional(),
  reviewed: z.enum(["yes", "no"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parse URL search params; anything invalid is ignored rather than rejected. */
export function parseHistoryFilters(
  params: Record<string, string | string[] | undefined>,
): HistoryFilters {
  const pick = (k: string) => {
    const v = first(params[k])?.trim();
    return v ? v : undefined;
  };
  const candidate = {
    template: pick("template"),
    from: pick("from"),
    to: pick("to"),
    reviewed: pick("reviewed"),
    page: pick("page"),
  };
  const out: HistoryFilters = { page: 1 };
  for (const key of ["template", "from", "to", "reviewed", "page"] as const) {
    const r = filtersSchema.partial().safeParse({ [key]: candidate[key] });
    if (!r.success) continue;
    const v = (r.data as Record<string, unknown>)[key];
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

const startOfDay = (d: string) => new Date(`${d}T00:00:00.000Z`);
const nextDay = (d: string) => new Date(startOfDay(d).getTime() + 86_400_000);

type SessionLike = Parameters<typeof requireUser>[0];

/** STAFF see only their own history; MANAGER and ADMIN see everyone's. */
export const canSeeAll = (role: AppRole) => hasRole(role, "MANAGER");

export async function listHistory(session: SessionLike, repo: HistoryRepo, f: HistoryFilters) {
  const user = requireUser(session);
  const all = canSeeAll(user.role);
  const { rows, total } = await repo.list({
    userId: all ? undefined : user.id,
    templateSlug: f.template,
    from: f.from ? startOfDay(f.from) : undefined,
    toExclusive: f.to ? nextDay(f.to) : undefined,
    reviewed: f.reviewed === undefined ? undefined : f.reviewed === "yes",
    page: f.page,
    pageSize: PAGE_SIZE,
  });
  return {
    rows,
    total,
    page: f.page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    scope: all ? ("all" as const) : ("own" as const),
    templates: await repo.templateOptions(),
  };
}

/** Someone else's generation is reported exactly like a missing one, for STAFF. */
export async function getHistoryDetail(
  session: SessionLike,
  repo: HistoryRepo,
  id: string,
): Promise<HistoryDetail & { isOwner: boolean }> {
  const user = requireUser(session);
  const d = await repo.get(id);
  if (!d || (!canSeeAll(user.role) && d.userId !== user.id)) throw new HistoryNotFoundError();
  return { ...d, isOwner: d.userId === user.id };
}

/** The text a user would copy or export: the last refinement, else the original output. */
export function latestDraft(d: Pick<HistoryDetail, "output" | "refinements">): string {
  return d.refinements.length ? d.refinements[d.refinements.length - 1].output : d.output;
}
