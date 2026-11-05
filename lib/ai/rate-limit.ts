export const DEFAULT_RATE_LIMIT_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;

/** RATE_LIMIT_PER_HOUR as a positive integer; anything else falls back to the default. */
export function rateLimitPerHour(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RATE_LIMIT_PER_HOUR?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_RATE_LIMIT_PER_HOUR;
  const n = Number(raw);
  return n > 0 ? n : DEFAULT_RATE_LIMIT_PER_HOUR;
}

export const rateLimitWindowStart = (now: Date) => new Date(now.getTime() - WINDOW_MS);

export type RateLimitDecision =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

/**
 * Sliding one-hour window over the user's saved generations and refinements.
 * `oldest` is the creation time of the oldest one still inside the window.
 */
export function checkRateLimit(args: {
  count: number;
  oldest: Date | null;
  limit: number;
  now: Date;
}): RateLimitDecision {
  const { count, oldest, limit, now } = args;
  if (count < limit) return { allowed: true, remaining: limit - count };
  const frees = (oldest ?? now).getTime() + WINDOW_MS;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((frees - now.getTime()) / 1000)),
  };
}
