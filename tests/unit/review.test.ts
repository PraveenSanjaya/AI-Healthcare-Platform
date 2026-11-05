import { describe, expect, it } from "vitest";
import { handleRequest } from "@/lib/ai/handler";
import { canCopy, reviewGeneration } from "@/lib/ai/review";
import { makeDeps, readLines, rowFromSeed, session } from "./helpers/generate-fakes";

const SLUG = "staff-spotlight-caption";
const inputs = {
  doctor_name: "Perera",
  specialty: "Cardiology",
  fun_fact: "Runs marathons",
  credentials: "MBBS",
};

async function setup(userId = "owner") {
  const ctx = makeDeps([rowFromSeed(SLUG)]);
  await readLines(await handleRequest(ctx.deps, session("STAFF", userId), { slug: SLUG, inputs }));
  return ctx;
}

describe("canCopy", () => {
  it("lets internal text be copied straight away", () => {
    expect(canCopy("INTERNAL", false)).toBe(true);
    expect(canCopy("INTERNAL", true)).toBe(true);
  });
  it("keeps patient-facing text locked until it is reviewed", () => {
    expect(canCopy("PATIENT_FACING", false)).toBe(false);
    expect(canCopy("PATIENT_FACING", true)).toBe(true);
  });
});

describe("reviewGeneration", () => {
  it("starts unreviewed", async () => {
    const ctx = await setup();
    const g = await ctx.deps.generations.find("gen-1");
    expect(g).toMatchObject({ reviewed: false, reviewedAt: null });
  });
  it("sets reviewed and reviewedAt and writes an audit entry", async () => {
    const ctx = await setup();
    const r = await reviewGeneration(ctx.deps, session("STAFF", "owner"), "gen-1");
    expect(r).toEqual({ ok: true, reviewedAt: "2026-11-05T12:00:00.000Z" });
    const g = await ctx.deps.generations.find("gen-1");
    expect(g?.reviewed).toBe(true);
    expect(g?.reviewedAt?.toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(ctx.audit[ctx.audit.length - 1]).toMatchObject({
      action: "GENERATION_REVIEWED",
      actorId: "owner",
      entityType: "Generation",
      entityId: "gen-1",
    });
  });
  it("is idempotent: keeps the first timestamp and audits once", async () => {
    const ctx = await setup();
    await reviewGeneration(ctx.deps, session("STAFF", "owner"), "gen-1");
    ctx.deps.now = () => new Date("2026-11-05T15:00:00Z");
    const again = await reviewGeneration(ctx.deps, session("STAFF", "owner"), "gen-1");
    expect(again).toEqual({ ok: true, reviewedAt: "2026-11-05T12:00:00.000Z" });
    expect(ctx.audit.filter((a) => a.action === "GENERATION_REVIEWED")).toHaveLength(1);
  });
  it("requires a signed-in user", async () => {
    const ctx = await setup();
    expect(await reviewGeneration(ctx.deps, null, "gen-1")).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    });
  });
  it("reports a missing generation as not found", async () => {
    const ctx = await setup();
    expect(await reviewGeneration(ctx.deps, session("STAFF", "owner"), "nope")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
  it("does not let anyone review someone else's generation, admins included", async () => {
    const ctx = await setup();
    for (const s of [session("STAFF", "other"), session("ADMIN", "admin-1")]) {
      expect(await reviewGeneration(ctx.deps, s, "gen-1")).toEqual({
        ok: false,
        error: "NOT_FOUND",
      });
    }
    expect((await ctx.deps.generations.find("gen-1"))?.reviewed).toBe(false);
  });
  it("is cleared by a refinement, because the text changed", async () => {
    const ctx = await setup();
    await reviewGeneration(ctx.deps, session("STAFF", "owner"), "gen-1");
    await readLines(
      await handleRequest(ctx.deps, session("STAFF", "owner"), {
        slug: SLUG,
        generationId: "gen-1",
        instruction: "Warmer",
      }),
    );
    const g = await ctx.deps.generations.find("gen-1");
    expect(g).toMatchObject({ reviewed: false, reviewedAt: null });
    const again = await reviewGeneration(ctx.deps, session("STAFF", "owner"), "gen-1");
    expect(again.ok).toBe(true);
    expect(ctx.audit.filter((a) => a.action === "GENERATION_REVIEWED")).toHaveLength(2);
  });
});
