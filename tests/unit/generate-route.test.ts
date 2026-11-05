import { describe, expect, it } from "vitest";
import { handleGenerate } from "@/lib/ai/generate";
import { ProviderError, type LLMProvider } from "@/lib/ai/providers";
import {
  failingProvider,
  makeDeps,
  readLines,
  rowFromSeed,
  session,
} from "./helpers/generate-fakes";

const SLUG = "staff-spotlight-caption";
const row = () => rowFromSeed(SLUG);
const okInputs = {
  doctor_name: "Perera",
  specialty: "Cardiology",
  fun_fact: "Runs marathons",
  credentials: "MBBS",
};
const post = (deps: ReturnType<typeof makeDeps>["deps"], s: unknown, body: unknown) =>
  handleGenerate(deps, s as never, body);

describe("POST /api/generate: auth and access", () => {
  it("returns 401 when signed out, before looking at the body", async () => {
    const { deps } = makeDeps([row()]);
    for (const body of [undefined, {}, { slug: SLUG, inputs: okInputs }]) {
      const res = await post(deps, null, body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
    }
  });
  it("returns 404 for an unknown template", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("ADMIN"), { slug: "nope", inputs: {} });
    expect(res.status).toBe(404);
  });
  it("hides a template STAFF may not use, exactly like a missing one", async () => {
    const hidden = rowFromSeed(SLUG, { allowedRoles: ["ADMIN", "MANAGER"] });
    const { deps, created } = makeDeps([hidden]);
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "TEMPLATE_NOT_FOUND" });
    expect(created).toHaveLength(0);
  });
  it("lets STAFF run a template that allows STAFF", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs });
    expect(res.status).toBe(200);
  });
  it("lets MANAGER and ADMIN run a STAFF-restricted template", async () => {
    const hidden = rowFromSeed(SLUG, { allowedRoles: ["ADMIN"] });
    for (const role of ["MANAGER", "ADMIN"] as const) {
      const { deps } = makeDeps([hidden]);
      expect((await post(deps, session(role), { slug: SLUG, inputs: okInputs })).status).toBe(200);
    }
  });
  it("refuses archived templates", async () => {
    const { deps } = makeDeps([rowFromSeed(SLUG, { archived: true })]);
    expect((await post(deps, session("ADMIN"), { slug: SLUG, inputs: okInputs })).status).toBe(404);
  });
  it("returns 409 when the template has no published version", async () => {
    const { deps } = makeDeps([rowFromSeed(SLUG, { current: null })]);
    expect((await post(deps, session("ADMIN"), { slug: SLUG, inputs: okInputs })).status).toBe(409);
  });
});

describe("POST /api/generate: validation", () => {
  it("returns 400 for a malformed body", async () => {
    const { deps } = makeDeps([row()]);
    for (const body of [
      undefined,
      null,
      "x",
      { slug: 1 },
      { slug: SLUG },
      { slug: SLUG, inputs: { a: 1 } },
    ]) {
      const res = await post(deps, session("ADMIN"), body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    }
  });
  it("returns 400 naming a missing required variable", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("ADMIN"), {
      slug: SLUG,
      inputs: { ...okInputs, doctor_name: "" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_INPUTS");
    expect(body.message).toContain("doctor_name");
  });
  it("returns 400 for an input the template does not declare", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("ADMIN"), {
      slug: SLUG,
      inputs: { ...okInputs, extra: "x" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("extra");
  });
  it("rejects an oversized input", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("ADMIN"), {
      slug: SLUG,
      inputs: { ...okInputs, fun_fact: "x".repeat(50_001) },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate: PHI", () => {
  const phi = { ...okInputs, fun_fact: "Call her on 0771234567 or a@b.lk" };

  it("blocks with 422 and the findings", async () => {
    const { deps, created } = makeDeps([row()]);
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: phi });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("PHI_DETECTED");
    expect(body.findings.map((f: { type: string }) => f.type).sort()).toEqual(["email", "phone"]);
    expect(body.findings[0].field).toBe("fun_fact");
    expect(created).toHaveLength(0);
  });
  it("checks every input, not only free-text ones", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("STAFF"), {
      slug: SLUG,
      inputs: { ...okInputs, doctor_name: "a@b.lk" },
    });
    expect(res.status).toBe(422);
  });
  it("audits PHI_BLOCKED without storing the matched text", async () => {
    const { deps, audit } = makeDeps([row()]);
    await post(deps, session("STAFF"), { slug: SLUG, inputs: phi });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "PHI_BLOCKED",
      actorId: "u-STAFF",
      metadata: { templateSlug: SLUG, count: 2, types: ["email", "phone"] },
    });
    expect(JSON.stringify(audit)).not.toContain("0771234567");
    expect(JSON.stringify(audit)).not.toContain("a@b.lk");
  });
  it("refuses an override from a non-admin with 403 and audits the block", async () => {
    for (const role of ["STAFF", "MANAGER"] as const) {
      const { deps, audit, created } = makeDeps([row()]);
      const res = await post(deps, session(role), {
        slug: SLUG,
        inputs: phi,
        override: { reason: "Needed for the demo please" },
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("OVERRIDE_FORBIDDEN");
      expect(audit[0]).toMatchObject({
        action: "PHI_BLOCKED",
        metadata: { overrideRejected: true },
      });
      expect(created).toHaveLength(0);
    }
  });
  it("requires a written reason of at least 10 characters for an override", async () => {
    const { deps } = makeDeps([row()]);
    for (const reason of ["", "short", "         "]) {
      const res = await post(deps, session("ADMIN"), {
        slug: SLUG,
        inputs: phi,
        override: { reason },
      });
      expect(res.status, reason).toBe(400);
    }
  });
  it("lets an ADMIN override with a reason, and logs PHI_OVERRIDE with the reason", async () => {
    const { deps, audit, created } = makeDeps([row()]);
    const res = await post(deps, session("ADMIN"), {
      slug: SLUG,
      inputs: phi,
      override: { reason: "Internal test of the intake wording" },
    });
    expect(res.status).toBe(200);
    await readLines(res);
    expect(created).toHaveLength(1);
    expect(audit.map((a) => a.action)).toEqual(["PHI_OVERRIDE", "GENERATION_CREATED"]);
    expect(audit[0].metadata).toMatchObject({
      reason: "Internal test of the intake wording",
      types: ["email", "phone"],
      templateSlug: SLUG,
    });
    expect(JSON.stringify(audit[0])).not.toContain("0771234567");
  });
  it("ignores an override when there is nothing to override", async () => {
    const { deps, audit } = makeDeps([row()]);
    const res = await post(deps, session("STAFF"), {
      slug: SLUG,
      inputs: okInputs,
      override: { reason: "not needed here at all" },
    });
    expect(res.status).toBe(200);
    await readLines(res);
    expect(audit.map((a) => a.action)).toEqual(["GENERATION_CREATED"]);
  });
});

describe("POST /api/generate: rate limit", () => {
  it("returns 429 with Retry-After once the hourly limit is used", async () => {
    const { deps, created } = makeDeps([row()], {
      usage: { count: 30, oldest: new Date("2026-11-05T11:30:00Z") },
    });
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(await res.json()).toEqual({ error: "RATE_LIMITED", retryAfterSeconds: 1800 });
    expect(created).toHaveLength(0);
  });
  it("honours RATE_LIMIT_PER_HOUR", async () => {
    const usage = { count: 3, oldest: new Date("2026-11-05T11:59:00Z") };
    const low = makeDeps([row()], { usage, env: { RATE_LIMIT_PER_HOUR: "3" } });
    expect((await post(low.deps, session("STAFF"), { slug: SLUG, inputs: okInputs })).status).toBe(
      429,
    );
    const high = makeDeps([row()], { usage, env: { RATE_LIMIT_PER_HOUR: "4" } });
    expect((await post(high.deps, session("STAFF"), { slug: SLUG, inputs: okInputs })).status).toBe(
      200,
    );
  });
  it("applies to ADMIN too", async () => {
    const { deps } = makeDeps([row()], {
      usage: { count: 30, oldest: new Date("2026-11-05T11:59:00Z") },
    });
    expect((await post(deps, session("ADMIN"), { slug: SLUG, inputs: okInputs })).status).toBe(429);
  });
});

describe("POST /api/generate: generation", () => {
  it("streams text chunks then a done line with the saved id", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs });
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    const lines = await readLines(res);
    expect(lines.filter((l) => l.type === "text").length).toBeGreaterThan(3);
    const done = lines[lines.length - 1];
    expect(done).toMatchObject({ type: "done", generationId: "gen-1" });
    expect(lines.filter((l) => l.type === "done")).toHaveLength(1);
  });
  it("saves inputs, the exact rendered prompt, output, model and tokens", async () => {
    const { deps, created } = makeDeps([row()]);
    const lines = await readLines(
      await post(deps, session("STAFF", "user-9"), { slug: SLUG, inputs: okInputs }),
    );
    const streamed = lines
      .filter((l) => l.type === "text")
      .map((l) => l.text)
      .join("");
    expect(created).toHaveLength(1);
    const g = created[0];
    expect(g.userId).toBe("user-9");
    expect(g.templateVersionId).toBe(`ver-${SLUG}`);
    expect(g.inputs).toEqual(okInputs);
    expect(g.output).toBe(streamed);
    expect(g.model).toBe("mock-1");
    expect(g.inputTokens).toBeGreaterThan(0);
    expect(g.outputTokens).toBeGreaterThan(0);
  });
  it("renders the variables into the prompt that is saved", async () => {
    const { deps, created } = makeDeps([row()]);
    await readLines(await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs }));
    const prompt = created[0].renderedPrompt;
    expect(prompt).toContain("Dr. Perera, specializing in Cardiology");
    expect(prompt).toContain("Runs marathons");
    expect(prompt).not.toMatch(/\{\{/);
  });
  it("sends the global system prompt with the clinic profile and the template role", async () => {
    let seen: Parameters<LLMProvider["streamGenerate"]>[0] | undefined;
    const spy: LLMProvider = {
      name: "spy",
      async *streamGenerate(req) {
        seen = req;
        yield { type: "text", text: "ok" };
        yield { type: "done", usage: { inputTokens: 1, outputTokens: 1, model: "spy-1" } };
      },
    };
    const { deps } = makeDeps([row()], { provider: spy });
    await readLines(await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs }));
    expect(seen!.system).toContain("Lakeside Clinic");
    expect(seen!.system).toContain("Never diagnose");
    expect(seen!.system).toContain("a healthcare brand storyteller");
    expect(seen!.messages).toHaveLength(1);
    expect(seen!.messages[0].role).toBe("user");
    expect(seen!.meta?.title).toBe("Staff Spotlight Caption");
  });
  it("writes a GENERATION_CREATED audit entry", async () => {
    const { deps, audit } = makeDeps([row()]);
    await readLines(await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs }));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "GENERATION_CREATED",
      entityType: "Generation",
      entityId: "gen-1",
      actorId: "u-STAFF",
      metadata: { templateSlug: SLUG, provider: "mock", model: "mock-1" },
    });
  });
  it("respects the template length limit", async () => {
    const sms = rowFromSeed("overdue-screening-reminder");
    const { deps, created } = makeDeps([sms]);
    await readLines(
      await post(deps, session("STAFF"), {
        slug: sms.slug,
        inputs: { clinic_name: "Lakeside Clinic", screening: "x" },
      }),
    );
    expect(created[0].output.length).toBeLessThanOrEqual(160);
  });
  it("sends an error line, saves nothing and hides provider details when the provider fails", async () => {
    const { deps, created, audit } = makeDeps([row()], { provider: failingProvider });
    const res = await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs });
    expect(res.status).toBe(200);
    const lines = await readLines(res);
    expect(lines).toEqual([{ type: "error", message: "Something went wrong while generating." }]);
    expect(created).toHaveLength(0);
    expect(audit).toHaveLength(0);
  });
  it("passes a ProviderError message through", async () => {
    const provider: LLMProvider = {
      name: "p",

      async *streamGenerate() {
        throw new ProviderError("The AI provider declined to answer this request.");
      },
    };
    const { deps } = makeDeps([row()], { provider });
    const lines = await readLines(
      await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs }),
    );
    expect(lines[0]).toEqual({
      type: "error",
      message: "The AI provider declined to answer this request.",
    });
  });
  it("errors when a provider streams no usage", async () => {
    const provider: LLMProvider = {
      name: "p",
      async *streamGenerate() {
        yield { type: "text", text: "x" };
      },
    };
    const { deps, created } = makeDeps([row()], { provider });
    const lines = await readLines(
      await post(deps, session("STAFF"), { slug: SLUG, inputs: okInputs }),
    );
    expect(lines[lines.length - 1].type).toBe("error");
    expect(created).toHaveLength(0);
  });
  it("sets no-store caching on JSON errors", async () => {
    const { deps } = makeDeps([row()]);
    const res = await post(deps, null, {});
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
