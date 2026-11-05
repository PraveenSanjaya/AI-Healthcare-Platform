export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export type LengthStatus = {
  words: number;
  chars: number;
  overWords: boolean;
  overChars: boolean;
  /** Human-readable warning, or null when within limits. */
  warning: string | null;
};

export function lengthStatus(
  text: string,
  limits: { maxWords?: number | null; maxChars?: number | null },
): LengthStatus {
  const words = countWords(text);
  const chars = text.length;
  const overWords = Boolean(limits.maxWords && words > limits.maxWords);
  const overChars = Boolean(limits.maxChars && chars > limits.maxChars);
  const parts = [
    overWords && `${words - limits.maxWords!} words over the ${limits.maxWords}-word limit`,
    overChars &&
      `${chars - limits.maxChars!} characters over the ${limits.maxChars}-character limit`,
  ].filter(Boolean);
  return { words, chars, overWords, overChars, warning: parts.length ? parts.join("; ") : null };
}
