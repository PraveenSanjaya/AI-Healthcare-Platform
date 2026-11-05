import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { LLMProvider } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Choose the provider from the environment. Mock is the default, and also the
 * fallback when the Anthropic provider is requested without an API key.
 */
export function getProvider(env: Record<string, string | undefined> = process.env): LLMProvider {
  const name = (env.LLM_PROVIDER ?? "mock").trim().toLowerCase() || "mock";
  if (name === "mock") return new MockProvider();
  if (name === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return new MockProvider();
    return new AnthropicProvider({ model: env.LLM_MODEL?.trim() || DEFAULT_MODEL, apiKey });
  }
  throw new Error(`Unsupported LLM_PROVIDER "${name}". Use "mock" or "anthropic".`);
}

export * from "./types";
export { MockProvider, mockOutput } from "./mock";
export { AnthropicProvider, type AnthropicLike } from "./anthropic";
