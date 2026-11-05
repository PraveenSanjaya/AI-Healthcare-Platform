import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type GenerateRequest, type LLMProvider, type StreamEvent } from "./types";

type FinalMessage = {
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
};
type RawEvent = { type: string; delta?: { type: string; text?: string } };

/** The slice of the SDK client this provider uses, so tests can inject a fake. */
export type AnthropicLike = {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user" | "assistant"; content: string }[];
    }): AsyncIterable<RawEvent> & { finalMessage(): Promise<FinalMessage> };
  };
};

/**
 * Streams from the Anthropic Messages API. Keys and prompts are never logged, and
 * SDK errors are replaced with a fixed message because they can echo request details.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: AnthropicLike;

  constructor(
    private readonly opts: { model: string; apiKey?: string },
    client?: AnthropicLike,
  ) {
    this.client = client ?? (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike);
  }

  async *streamGenerate(req: GenerateRequest): AsyncGenerator<StreamEvent> {
    let final: FinalMessage;
    try {
      const stream = this.client.messages.stream({
        model: this.opts.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          if (event.delta.text) yield { type: "text", text: event.delta.text };
        }
      }
      final = await stream.finalMessage();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const status = (e as { status?: unknown })?.status;
      throw new ProviderError(
        typeof status === "number"
          ? `The AI provider returned an error (HTTP ${status}).`
          : "The AI provider could not be reached.",
      );
    }
    if (final.stop_reason === "refusal") {
      throw new ProviderError("The AI provider declined to answer this request.");
    }
    yield {
      type: "done",
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        model: final.model,
      },
    };
  }
}
