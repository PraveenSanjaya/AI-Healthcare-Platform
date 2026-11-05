export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Usage = { inputTokens: number; outputTokens: number; model: string };

/** Streamed text chunks, then exactly one `done` event carrying the final usage. */
export type StreamEvent = { type: "text"; text: string } | { type: "done"; usage: Usage };

export type GenerateRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Template facts a provider may use; the real model ignores them. */
  meta?: { title?: string; maxWords?: number | null; maxChars?: number | null };
};

export interface LLMProvider {
  readonly name: string;
  streamGenerate(req: GenerateRequest): AsyncIterable<StreamEvent>;
}

/** Provider failure with a message that is safe to show: it never contains prompts or keys. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Collect a whole stream (used by tests and non-streaming callers). */
export async function collect(stream: AsyncIterable<StreamEvent>) {
  let text = "";
  let usage: Usage | null = null;
  for await (const e of stream) {
    if (e.type === "text") text += e.text;
    else usage = e.usage;
  }
  if (!usage) throw new ProviderError("Stream ended without usage");
  return { text, usage };
}
