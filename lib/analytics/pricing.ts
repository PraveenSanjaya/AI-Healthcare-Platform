/**
 * Estimated list prices in US dollars per million tokens, by model id. These are for the
 * "estimate" figures on the analytics page only; they are not billing data, and they will go
 * stale. Update this table when prices change. The mock provider is free.
 */
export const PRICE_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "mock-1": { input: 0, output: 0 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Exact match first, then the longest known id the model name starts with (dated variants). */
export function priceFor(model: string): { input: number; output: number } | null {
  if (PRICE_PER_MILLION_TOKENS[model]) return PRICE_PER_MILLION_TOKENS[model];
  const key = Object.keys(PRICE_PER_MILLION_TOKENS)
    .filter((k) => model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICE_PER_MILLION_TOKENS[key] : null;
}

/** Estimated cost in dollars, or null when the model has no price in the table. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
