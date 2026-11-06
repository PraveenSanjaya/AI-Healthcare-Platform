import { randomUUID } from "node:crypto";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Needs the real database: the guarantee under test is a Postgres advisory lock.
 * Skipped when no database is reachable (for example a machine without one).
 */
let reachable = false;
const userId = `ratelimit-test-${randomUUID()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
}, 30_000);

afterAll(async () => {
  if (!reachable) return;
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.rateLimitHit.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

describe("rate limit reserve (database)", () => {
  it("never lets concurrent requests exceed the limit", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { prismaGenerationRepo } = await import("@/lib/ai/repo");
    const limit = 5;
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => prismaGenerationRepo.reserve(userId, since, limit)),
    );
    expect(results.filter((r) => r.reserved)).toHaveLength(limit);
    const again = await prismaGenerationRepo.reserve(userId, since, limit);
    expect(again.reserved).toBe(false);
    expect(again.count).toBe(limit);
  }, 60_000);
});
