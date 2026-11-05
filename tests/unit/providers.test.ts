import { describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  MockProvider,
  ProviderError,
  collect,
  getProvider,
  mockOutput,
  type AnthropicLike,
  type GenerateRequest,
} from "@/lib/ai/providers";

const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  system: "sys",
  messages: [{ role: "user", content: "write it" }],
  maxTokens: 1000,
  meta: { title: "Staff Spotlight Caption" },
  ...over,
});

describe("MockProvider", () => {
  const mock = new MockProvider();

  it("is deterministic", async () => {
    const a = await collect(mock.streamGenerate(req()));
    const b = await collect(mock.streamGenerate(req()));
    expect(a).toEqual(b);
  });
  it("echoes the template title as Markdown", async () => {
    const { text } = await collect(mock.streamGenerate(req()));
    expect(text.startsWith("# Staff Spotlight Caption")).toBe(true);
  });
  it("streams several chunks that join to the full output", async () => {
    const chunks: string[] = [];
    for await (const e of mock.streamGenerate(req())) if (e.type === "text") chunks.push(e.text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join("")).toBe(mockOutput(req()));
  });
  it("ends with exactly one done event carrying usage and the model", async () => {
    const events = [];
    for await (const e of mock.streamGenerate(req())) events.push(e);
    const done = events.filter((e) => e.type === "done");
    expect(done).toHaveLength(1);
    expect(events[events.length - 1].type).toBe("done");
    const { usage } = await collect(mock.streamGenerate(req()));
    expect(usage.model).toBe("mock-1");
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });
  it("respects maxWords", () => {
    const out = mockOutput(req({ meta: { title: "T", maxWords: 10 } }));
    expect(out.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(10);
  });
  it("respects maxChars", () => {
    const out = mockOutput(req({ meta: { title: "T", maxChars: 160 } }));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.length).toBeGreaterThan(80);
  });
  it("respects both limits together", () => {
    const out = mockOutput(req({ meta: { title: "T", maxWords: 30, maxChars: 100 } }));
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(30);
  });
  it("is not limited when no limit is given", () => {
    expect(mockOutput(req()).split(/\s+/).length).toBeGreaterThan(20);
  });
  it("falls back to a title when none is given", () => {
    expect(mockOutput(req({ meta: undefined }))).toMatch(/^# Untitled/);
  });
  it("reflects a refinement instruction in a follow-up turn", () => {
    const out = mockOutput(
      req({
        messages: [
          { role: "user", content: "write it" },
          { role: "assistant", content: "draft" },
          { role: "user", content: "make it shorter" },
        ],
      }),
    );
    expect(out).toContain("Refinement applied:** make it shorter");
  });
});

function fakeClient(opts: {
  events?: unknown[];
  final?: Partial<{ model: string; stop_reason: string | null }>;
  throws?: unknown;
}) {
  const calls: unknown[] = [];
  const client: AnthropicLike = {
    messages: {
      stream(params) {
        calls.push(params);
        const events = opts.events ?? [];
        const iterable = {
          async *[Symbol.asyncIterator]() {
            if (opts.throws) throw opts.throws;
            for (const e of events) yield e as { type: string };
          },
          async finalMessage() {
            return {
              model: "claude-sonnet-5-5",
              stop_reason: "end_turn",
              usage: { input_tokens: 12, output_tokens: 7 },
              ...opts.final,
            };
          },
        };
        return iterable;
      },
    },
  };
  return { client, calls };
}

describe("AnthropicProvider", () => {
  const delta = (text: string) => ({
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  });

  it("passes model, system, messages and max tokens to the SDK", async () => {
    const { client, calls } = fakeClient({ events: [delta("Hi")] });
    const p = new AnthropicProvider({ model: "claude-sonnet-5-5" }, client);
    await collect(p.streamGenerate(req({ maxTokens: 321 })));
    expect(calls[0]).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 321,
      system: "sys",
      messages: [{ role: "user", content: "write it" }],
    });
  });
  it("yields only text deltas, then usage from the final message", async () => {
    const { client } = fakeClient({
      events: [
        { type: "message_start" },
        delta("Hel"),
        { type: "content_block_delta", delta: { type: "thinking_delta" } },
        delta("lo"),
        delta(""),
        { type: "message_stop" },
      ],
    });
    const out = await collect(new AnthropicProvider({ model: "m" }, client).streamGenerate(req()));
    expect(out.text).toBe("Hello");
    expect(out.usage).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      model: "claude-sonnet-5-5",
    });
  });
  it("turns a refusal into a safe error", async () => {
    const { client } = fakeClient({ events: [delta("x")], final: { stop_reason: "refusal" } });
    await expect(
      collect(new AnthropicProvider({ model: "m" }, client).streamGenerate(req())),
    ).rejects.toThrow(/declined/);
  });
  it("hides SDK error details, which can echo the request", async () => {
    const secret = "sk-ant-secret and the patient prompt";
    const { client } = fakeClient({ throws: Object.assign(new Error(secret), { status: 429 }) });
    const err = await collect(
      new AnthropicProvider({ model: "m" }, client).streamGenerate(req()),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toBe("The AI provider returned an error (HTTP 429).");
    expect((err as Error).message).not.toContain("sk-ant");
  });
  it("reports an unreachable provider without details", async () => {
    const { client } = fakeClient({ throws: new Error("ECONNRESET to https://x?key=abc") });
    await expect(
      collect(new AnthropicProvider({ model: "m" }, client).streamGenerate(req())),
    ).rejects.toThrow("The AI provider could not be reached.");
  });
  it("constructs a real SDK client when none is injected", () => {
    expect(new AnthropicProvider({ model: "m", apiKey: "k" }).name).toBe("anthropic");
  });
});

describe("getProvider", () => {
  it("defaults to the mock", () => {
    expect(getProvider({}).name).toBe("mock");
    expect(getProvider({ LLM_PROVIDER: "" }).name).toBe("mock");
    expect(getProvider({ LLM_PROVIDER: "mock", ANTHROPIC_API_KEY: "k" }).name).toBe("mock");
  });
  it("falls back to the mock when anthropic has no key", () => {
    expect(getProvider({ LLM_PROVIDER: "anthropic" }).name).toBe("mock");
    expect(getProvider({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "  " }).name).toBe("mock");
  });
  it("uses anthropic when a key is present", () => {
    expect(getProvider({ LLM_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "k" }).name).toBe(
      "anthropic",
    );
  });
  it("rejects an unknown provider", () => {
    expect(() => getProvider({ LLM_PROVIDER: "openai" })).toThrow(/Unsupported LLM_PROVIDER/);
  });
});

describe("collect", () => {
  it("fails when a stream has no usage", async () => {
    async function* bad() {
      yield { type: "text" as const, text: "x" };
    }
    await expect(collect(bad())).rejects.toThrow(/without usage/);
  });
});
