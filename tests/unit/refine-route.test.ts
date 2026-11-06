import { describe, expect, it } from "vitest";
import { handleRequest } from "@/lib/ai/handler";
import type { LLMProvider } from "@/lib/ai/providers";
import { makeDeps, readLines, rowFromSeed, session } from "./helpers/generate-fakes";

const SLUG = "staff-spotlight-caption";
const inputs = {
  doctor_name: "Perera",
  specialty: "Cardiology",
  fun_fact: "Runs marathons",
  credentials: "MBBS",
};

async function generated(role: "STAFF" | "ADMIN" = "STAFF", userId?: string) {
  const ctx = makeDeps([rowFromSeed(SLUG)]);
  const res = await handleRequest(ctx.deps, session(role, userId), { slug: SLUG, inputs });
  await readLines(res);
  return ctx;
}
const refine = (
  ctx: Awaited<ReturnType<typeof generated>>,
  s: ReturnType<typeof session> | null,
  body: Record<string, unknown>,
) =>
  handleRequest(ctx.deps, s, {
    slug: SLUG,
    generationId: "gen-1",
    instruction: "Shorter",
    ...body,
  });

describe("refine: access", () => {
  it("returns 401 when signed out", async () => {
    const ctx = await generated();
    expect((await refine(ctx, null, {})).status).toBe(401);
  });
  it("returns 404 for a generation that does not exist", async () => {
    const ctx = await generated();
    expect((await refine(ctx, session("STAFF"), { generationId: "nope" })).status).toBe(404);
  });
  it("treats another user's generation as not found, even for an admin", async () => {
    const ctx = await generated("STAFF", "owner");
    for (const s of [session("STAFF", "someone-else"), session("ADMIN", "admin-1")]) {
      const res = await refine(ctx, s, {});
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "GENERATION_NOT_FOUND" });
    }
    expect(ctx.refinements).toHaveLength(0);
  });
  it("returns 400 for an empty or oversized instruction", async () => {
    const ctx = await generated();
    for (const instruction of ["", "   ", "x".repeat(2001)]) {
      expect((await refine(ctx, session("STAFF"), { instruction })).status).toBe(400);
    }
  });
  it("returns 409 when the template has a newer version than the generation", async () => {
    const ctx = await generated();
    ctx.store.get("gen-1")!.templateVersionId = "older-version";
    const res = await refine(ctx, session("STAFF"), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("TEMPLATE_CHANGED");
  });
  it("is rate limited like a generation", async () => {
    const ctx = await generated();
    ctx.deps.generations.reserve = async () => ({
      reserved: false,
      count: 30,
      oldest: new Date("2026-11-05T11:30:00Z"),
    });
    const res = await refine(ctx, session("STAFF"), {});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
  });
});

describe("refine: PHI in the instruction", () => {
  const bad = { instruction: "Add that she can be reached on 0771234567" };
  it("blocks with 422 and audits PHI_BLOCKED", async () => {
    const ctx = await generated();
    const res = await refine(ctx, session("STAFF"), bad);
    expect(res.status).toBe(422);
    expect((await res.json()).findings[0]).toMatchObject({ field: "instruction", type: "phone" });
    expect(ctx.audit.map((a) => a.action)).toEqual(["GENERATION_CREATED", "PHI_BLOCKED"]);
    expect(ctx.refinements).toHaveLength(0);
  });
  it("lets an admin override with a reason", async () => {
    const ctx = await generated("ADMIN");
    const res = await refine(ctx, session("ADMIN"), {
      ...bad,
      override: { reason: "Clinic's own published number" },
    });
    expect(res.status).toBe(200);
    await readLines(res);
    expect(ctx.audit.map((a) => a.action)).toEqual([
      "GENERATION_CREATED",
      "PHI_OVERRIDE",
      "GENERATION_REFINED",
    ]);
  });
});

describe("refine: conversation", () => {
  it("continues the same conversation and saves a refinement", async () => {
    const seen: Parameters<LLMProvider["streamGenerate"]>[0][] = [];
    const ctx = await generated();
    const real = ctx.deps.provider;
    ctx.deps.provider = {
      name: real.name,
      streamGenerate(req) {
        seen.push(req);
        return real.streamGenerate(req);
      },
    };
    const first = ctx.created[0];

    const lines = await readLines(await refine(ctx, session("STAFF"), { instruction: "Shorter" }));
    expect(lines[lines.length - 1]).toMatchObject({
      type: "done",
      generationId: "gen-1",
      refinementId: "ref-1",
    });
    expect(seen[0].messages).toEqual([
      { role: "user", content: first.renderedPrompt },
      { role: "assistant", content: first.output },
      { role: "user", content: "Shorter" },
    ]);
    expect(seen[0].system).toContain("a healthcare brand storyteller");
    expect(ctx.refinements).toEqual([
      expect.objectContaining({ generationId: "gen-1", instruction: "Shorter" }),
    ]);
    expect(ctx.refinements[0].output).toContain("Refinement applied:** Shorter");
  });
  it("includes earlier refinements in later turns", async () => {
    const seen: Parameters<LLMProvider["streamGenerate"]>[0][] = [];
    const ctx = await generated();
    await readLines(await refine(ctx, session("STAFF"), { instruction: "Shorter" }));
    const real = ctx.deps.provider;
    ctx.deps.provider = {
      name: real.name,
      streamGenerate(req) {
        seen.push(req);
        return real.streamGenerate(req);
      },
    };
    await readLines(await refine(ctx, session("STAFF"), { instruction: "Warmer" }));
    expect(
      seen[0].messages.map((m) => [
        m.role,
        m.content === "Shorter" || m.content === "Warmer" ? m.content : "…",
      ]),
    ).toEqual([
      ["user", "…"],
      ["assistant", "…"],
      ["user", "Shorter"],
      ["assistant", "…"],
      ["user", "Warmer"],
    ]);
    expect(ctx.refinements).toHaveLength(2);
  });
  it("audits GENERATION_REFINED with the refinement id", async () => {
    const ctx = await generated();
    await readLines(await refine(ctx, session("STAFF"), {}));
    expect(ctx.audit[1]).toMatchObject({
      action: "GENERATION_REFINED",
      entityType: "Generation",
      entityId: "gen-1",
      metadata: { refinementId: "ref-1", provider: "mock" },
    });
  });
  it("saves nothing when the provider fails", async () => {
    const ctx = await generated();
    ctx.deps.provider = {
      name: "failing",

      async *streamGenerate() {
        throw new Error("secret");
      },
    };
    const lines = await readLines(await refine(ctx, session("STAFF"), {}));
    expect(lines).toEqual([{ type: "error", message: "Something went wrong while generating." }]);
    expect(ctx.refinements).toHaveLength(0);
  });
  it("still routes a body without generationId to generation", async () => {
    const ctx = makeDeps([rowFromSeed(SLUG)]);
    const res = await handleRequest(ctx.deps, session("STAFF"), { slug: SLUG, inputs });
    const lines = await readLines(res);
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", generationId: "gen-1" });
    expect(ctx.refinements).toHaveLength(0);
  });
});
