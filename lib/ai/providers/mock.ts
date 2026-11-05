import type { GenerateRequest, LLMProvider, StreamEvent } from "./types";

const FILLER =
  "This is a deterministic mock draft produced without calling any language model. " +
  "It exists so the whole flow can be exercised offline. " +
  "Replace it with real output by setting LLM_PROVIDER=anthropic and an API key.";

const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** Cut to at most `maxWords` words and `maxChars` characters, on a word boundary. */
function applyLimits(text: string, maxWords?: number | null, maxChars?: number | null): string {
  let out = text;
  if (maxWords) {
    const words = out.match(/\S+\s*/g) ?? [];
    if (words.length > maxWords) out = words.slice(0, maxWords).join("").trimEnd();
  }
  if (maxChars && out.length > maxChars) {
    out = out.slice(0, maxChars);
    const cut = out.lastIndexOf(" ");
    if (cut > maxChars / 2) out = out.slice(0, cut);
    out = out.trimEnd();
  }
  return out;
}

/** The text the mock "writes": same input, same output. */
export function mockOutput(req: GenerateRequest): string {
  const title = req.meta?.title?.trim() || "Untitled";
  const last = req.messages[req.messages.length - 1];
  const refinement = req.messages.length > 1 && last?.role === "user";
  const parts = [`# ${title}`, "", FILLER];
  if (refinement) parts.push("", `**Refinement applied:** ${last.content.trim()}`);
  else parts.push("", "- First point", "- Second point", "- Third point");
  return applyLimits(parts.join("\n"), req.meta?.maxWords, req.meta?.maxChars);
}

export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async *streamGenerate(req: GenerateRequest): AsyncGenerator<StreamEvent> {
    const output = mockOutput(req);
    for (const chunk of output.match(/\S+\s*|\s+/g) ?? []) yield { type: "text", text: chunk };
    const input = req.system + req.messages.map((m) => m.content).join("");
    yield {
      type: "done",
      usage: {
        inputTokens: approxTokens(input),
        outputTokens: approxTokens(output),
        model: "mock-1",
      },
    };
  }
}
