import { describe, expect, it } from "vitest";
import { checkRateLimit, rateLimitPerHour, rateLimitWindowStart } from "@/lib/ai/rate-limit";

const now = new Date("2026-11-05T12:00:00Z");

describe("rateLimitPerHour", () => {
  it("defaults to 30", () => {
    expect(rateLimitPerHour({})).toBe(30);
    expect(rateLimitPerHour({ RATE_LIMIT_PER_HOUR: "" })).toBe(30);
  });
  it("reads a positive integer", () => {
    expect(rateLimitPerHour({ RATE_LIMIT_PER_HOUR: "5" })).toBe(5);
    expect(rateLimitPerHour({ RATE_LIMIT_PER_HOUR: " 100 " })).toBe(100);
  });
  it("ignores zero, negatives, decimals and junk", () => {
    for (const v of ["0", "-3", "2.5", "many", "1e3"])
      expect(rateLimitPerHour({ RATE_LIMIT_PER_HOUR: v })).toBe(30);
  });
});

describe("checkRateLimit", () => {
  it("allows while under the limit and reports what is left", () => {
    expect(checkRateLimit({ count: 29, oldest: now, limit: 30, now })).toEqual({
      allowed: true,
      remaining: 1,
    });
  });
  it("blocks at the limit and says when the oldest use leaves the window", () => {
    const oldest = new Date("2026-11-05T11:30:00Z");
    expect(checkRateLimit({ count: 30, oldest, limit: 30, now })).toEqual({
      allowed: false,
      retryAfterSeconds: 30 * 60,
    });
  });
  it("never reports less than one second", () => {
    const oldest = new Date("2026-11-05T11:00:00Z");
    const r = checkRateLimit({ count: 3, oldest, limit: 3, now });
    expect(r).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });
  it("copes with a missing oldest timestamp", () => {
    expect(checkRateLimit({ count: 1, oldest: null, limit: 1, now })).toEqual({
      allowed: false,
      retryAfterSeconds: 3600,
    });
  });
});

describe("rateLimitWindowStart", () => {
  it("is one hour back", () => {
    expect(rateLimitWindowStart(now).toISOString()).toBe("2026-11-05T11:00:00.000Z");
  });
});
