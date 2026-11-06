import { describe, expect, it } from "vitest";
import { estimateCost, priceFor, PRICE_PER_MILLION_TOKENS } from "@/lib/analytics/pricing";
import {
  MAX_DAYS,
  fillDays,
  getAnalytics,
  parseRange,
  summariseCost,
  type AnalyticsRepo,
  type Range,
} from "@/lib/analytics/service";
import { AuthError } from "@/lib/auth/guards";

const NOW = new Date("2026-11-30T15:00:00Z");
const as = (role: string) => ({ user: { id: `u-${role}`, role } });

describe("parseRange", () => {
  it("defaults to the last 30 days ending today, inclusive", () => {
    const r = parseRange({}, NOW);
    expect(r).toMatchObject({ from: "2026-11-01", to: "2026-11-30", days: 30 });
    expect(r.fromDate.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r.toExclusive.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("reads a valid range", () => {
    expect(parseRange({ from: "2026-10-01", to: "2026-10-10" }, NOW)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-10",
      days: 10,
    });
  });
  it("treats a single day as one day", () => {
    expect(parseRange({ from: "2026-10-05", to: "2026-10-05" }, NOW).days).toBe(1);
  });
  it("swaps a backwards range", () => {
    expect(parseRange({ from: "2026-10-10", to: "2026-10-01" }, NOW)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-10",
    });
  });
  it("falls back for invalid or impossible dates", () => {
    expect(parseRange({ from: "nope", to: "2026-13-45" }, NOW)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(parseRange({ from: "2026-02-30" }, NOW).days).toBe(30);
  });
  it("only a start date runs 30 days back from today; only an end date runs 30 days back from it", () => {
    expect(parseRange({ to: "2026-10-31" }, NOW)).toMatchObject({
      from: "2026-10-02",
      to: "2026-10-31",
    });
  });
  it("caps the range at a year", () => {
    const r = parseRange({ from: "2020-01-01", to: "2026-11-30" }, NOW);
    expect(r.days).toBe(MAX_DAYS);
    expect(r.to).toBe("2026-11-30");
  });
  it("uses the first value of a repeated parameter", () => {
    expect(parseRange({ from: ["2026-11-10", "2026-01-01"], to: "2026-11-12" }, NOW).from).toBe(
      "2026-11-10",
    );
  });
});

describe("fillDays", () => {
  const range = parseRange({ from: "2026-11-01", to: "2026-11-05" }, NOW);
  it("returns every day in the range, zero where there is no data", () => {
    expect(
      fillDays(range, [
        { day: "2026-11-02", count: 4 },
        { day: "2026-11-05", count: 1 },
      ]),
    ).toEqual([
      { day: "2026-11-01", count: 0 },
      { day: "2026-11-02", count: 4 },
      { day: "2026-11-03", count: 0 },
      { day: "2026-11-04", count: 0 },
      { day: "2026-11-05", count: 1 },
    ]);
  });
  it("ignores rows outside the range", () => {
    expect(fillDays(range, [{ day: "2026-10-31", count: 9 }]).every((d) => d.count === 0)).toBe(
      true,
    );
  });
});

describe("pricing", () => {
  it("prices known models per million tokens", () => {
    expect(estimateCost("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(12);
    expect(estimateCost("claude-haiku-5-5", 2_000_000, 0)).toBeCloseTo(0.2);
    expect(estimateCost("mock-1", 5000, 5000)).toBe(0);
  });
  it("matches dated variants by the longest known prefix", () => {
    expect(priceFor("claude-opus-5-5-20261101")).toEqual(
      PRICE_PER_MILLION_TOKENS["claude-opus-5-5"],
    );
    expect(priceFor("claude-opus-5-20261101")).toEqual(PRICE_PER_MILLION_TOKENS["claude-opus-5"]);
  });
  it("returns null for an unknown model instead of guessing", () => {
    expect(estimateCost("some-other-model", 1000, 1000)).toBeNull();
    expect(priceFor("claude")).toBeNull();
  });
  it("sums costs and lists unpriced models separately", () => {
    const c = summariseCost([
      { model: "claude-sonnet-5-5", generations: 2, inputTokens: 1_000_000, outputTokens: 0 },
      { model: "mock-1", generations: 9, inputTokens: 10, outputTokens: 10 },
      { model: "mystery", generations: 1, inputTokens: 1_000_000, outputTokens: 1_000_000 },
    ]);
    expect(c.estimatedUsd).toBe(2);
    expect(c.unpricedModels).toEqual(["mystery"]);
    expect(c.byModel.map((m) => m.estimatedUsd)).toEqual([2, 0, null]);
  });
});

function repo(over: Partial<AnalyticsRepo> = {}): AnalyticsRepo {
  return {
    perTemplate: async () => [
      { slug: "b", title: "B", count: 2 },
      { slug: "a", title: "A", count: 2 },
      { slug: "c", title: "C", count: 5 },
    ],
    perUser: async () => [
      { userId: "1", name: "Zed", count: 1 },
      { userId: "2", name: "Amy", count: 8 },
    ],
    perDay: async () => [{ day: "2026-11-30", count: 9 }],
    phiCounts: async () => ({ blocked: 4, overrides: 1 }),
    patientFacingReview: async () => ({ total: 8, reviewed: 6 }),
    avgOutputChars: async () => 412.6,
    tokensByModel: async () => [
      { model: "claude-sonnet-5-5", generations: 6, inputTokens: 600, outputTokens: 400 },
      { model: "mock-1", generations: 3, inputTokens: 100, outputTokens: 50 },
    ],
    ...over,
  };
}
const range: Range = parseRange({}, NOW);

describe("getAnalytics", () => {
  it("is for MANAGER and ADMIN only", async () => {
    await expect(getAnalytics(as("STAFF"), repo(), range)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getAnalytics(null, repo(), range)).rejects.toBeInstanceOf(AuthError);
    for (const role of ["MANAGER", "ADMIN"]) {
      expect((await getAnalytics(as(role), repo(), range)).total).toBe(9);
    }
  });
  it("sorts by count, then name", async () => {
    const a = await getAnalytics(as("ADMIN"), repo(), range);
    expect(a.perTemplate.map((t) => t.slug)).toEqual(["c", "a", "b"]);
    expect(a.perUser.map((u) => u.name)).toEqual(["Amy", "Zed"]);
  });
  it("fills the day series to the full range", async () => {
    const a = await getAnalytics(as("ADMIN"), repo(), range);
    expect(a.perDay).toHaveLength(30);
    expect(a.perDay[29]).toEqual({ day: "2026-11-30", count: 9 });
    expect(a.perDay[0]).toEqual({ day: "2026-11-01", count: 0 });
  });
  it("reports PHI blocks and overrides", async () => {
    const a = await getAnalytics(as("ADMIN"), repo(), range);
    expect([a.phiBlocked, a.phiOverrides]).toEqual([4, 1]);
  });
  it("computes the patient-facing review rate", async () => {
    const a = await getAnalytics(as("ADMIN"), repo(), range);
    expect(a.review).toEqual({ total: 8, reviewed: 6, rate: 0.75 });
  });
  it("review rate is null, not 0%, when there are no patient-facing drafts", async () => {
    const a = await getAnalytics(
      as("ADMIN"),
      repo({ patientFacingReview: async () => ({ total: 0, reviewed: 0 }) }),
      range,
    );
    expect(a.review.rate).toBeNull();
  });
  it("rounds the average output length and totals tokens and cost", async () => {
    const a = await getAnalytics(as("ADMIN"), repo(), range);
    expect(a.avgOutputChars).toBe(413);
    expect([a.inputTokens, a.outputTokens]).toEqual([700, 450]);
    expect(a.cost.estimatedUsd).toBeCloseTo((600 * 2 + 400 * 10) / 1_000_000);
    expect(a.cost.unpricedModels).toEqual([]);
  });
  it("handles an empty range", async () => {
    const empty = repo({
      perTemplate: async () => [],
      perUser: async () => [],
      perDay: async () => [],
      phiCounts: async () => ({ blocked: 0, overrides: 0 }),
      patientFacingReview: async () => ({ total: 0, reviewed: 0 }),
      avgOutputChars: async () => null,
      tokensByModel: async () => [],
    });
    const a = await getAnalytics(as("MANAGER"), empty, range);
    expect(a.total).toBe(0);
    expect(a.avgOutputChars).toBeNull();
    expect(a.cost).toEqual({ estimatedUsd: 0, unpricedModels: [], byModel: [] });
    expect(a.perDay.every((d) => d.count === 0)).toBe(true);
  });
});
