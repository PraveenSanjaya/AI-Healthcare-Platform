import { requireRole } from "@/lib/auth/guards";
import { isCalendarDate } from "@/lib/dates";
import { estimateCost } from "./pricing";

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

export type Range = {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  fromDate: Date;
  toExclusive: Date;
  days: number;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
const validDay = (s: string | undefined): s is string => Boolean(s && isCalendarDate(s));
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();

/**
 * The date range from search params: the last 30 days ending today by default, never longer
 * than a year, swapped if given backwards. Invalid dates fall back to the default.
 */
export function parseRange(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): Range {
  const today = isoDay(now);
  let to = first(params.to);
  let from = first(params.from);
  if (!validDay(to)) to = today;
  if (!validDay(from))
    from = isoDay(new Date(startOfDay(to).getTime() - (DEFAULT_DAYS - 1) * DAY_MS));
  if (from > to) [from, to] = [to, from];
  let days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) + 1;
  if (days > MAX_DAYS) {
    from = isoDay(new Date(startOfDay(to).getTime() - (MAX_DAYS - 1) * DAY_MS));
    days = MAX_DAYS;
  }
  return {
    from,
    to,
    fromDate: startOfDay(from),
    toExclusive: new Date(startOfDay(to).getTime() + DAY_MS),
    days,
  };
}

export type ModelUsage = {
  model: string;
  generations: number;
  inputTokens: number;
  outputTokens: number;
};

/** All the numbers come from the database as aggregates; the service only shapes them. */
export type AnalyticsRepo = {
  perTemplate(r: Range): Promise<{ slug: string; title: string; count: number }[]>;
  perUser(r: Range): Promise<{ userId: string; name: string; count: number }[]>;
  perDay(r: Range): Promise<{ day: string; count: number }[]>;
  phiCounts(r: Range): Promise<{ blocked: number; overrides: number }>;
  patientFacingReview(r: Range): Promise<{ total: number; reviewed: number }>;
  avgOutputChars(r: Range): Promise<number | null>;
  tokensByModel(r: Range): Promise<ModelUsage[]>;
};

/** One entry per day in the range, with zero for days that have no generations. */
export function fillDays(range: Range, rows: { day: string; count: number }[]) {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return Array.from({ length: range.days }, (_, i) => {
    const day = isoDay(new Date(range.fromDate.getTime() + i * DAY_MS));
    return { day, count: byDay.get(day) ?? 0 };
  });
}

export type CostSummary = {
  estimatedUsd: number;
  /** Models that were used but have no price in the table; their cost is not included. */
  unpricedModels: string[];
  byModel: (ModelUsage & { estimatedUsd: number | null })[];
};

export function summariseCost(usage: ModelUsage[]): CostSummary {
  const byModel = usage.map((u) => ({
    ...u,
    estimatedUsd: estimateCost(u.model, u.inputTokens, u.outputTokens),
  }));
  return {
    estimatedUsd: byModel.reduce((sum, m) => sum + (m.estimatedUsd ?? 0), 0),
    unpricedModels: byModel.filter((m) => m.estimatedUsd === null).map((m) => m.model),
    byModel,
  };
}

type SessionLike = Parameters<typeof requireRole>[0];

export async function getAnalytics(session: SessionLike, repo: AnalyticsRepo, range: Range) {
  requireRole(session, "MANAGER");
  const [perTemplate, perUser, perDay, phi, review, avgChars, usage] = await Promise.all([
    repo.perTemplate(range),
    repo.perUser(range),
    repo.perDay(range),
    repo.phiCounts(range),
    repo.patientFacingReview(range),
    repo.avgOutputChars(range),
    repo.tokensByModel(range),
  ]);
  const total = usage.reduce((n, u) => n + u.generations, 0);
  return {
    range,
    total,
    perTemplate: [...perTemplate].sort(
      (a, b) => b.count - a.count || a.title.localeCompare(b.title),
    ),
    perUser: [...perUser].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    perDay: fillDays(range, perDay),
    phiBlocked: phi.blocked,
    phiOverrides: phi.overrides,
    review: {
      total: review.total,
      reviewed: review.reviewed,
      // null, not 0%, when there are no patient-facing drafts: nothing to review is not a failure.
      rate: review.total === 0 ? null : review.reviewed / review.total,
    },
    avgOutputChars: avgChars === null ? null : Math.round(avgChars),
    inputTokens: usage.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
    cost: summariseCost(usage),
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
