import { redactPHI } from "@/lib/safety/phi";

/**
 * Last line of defence for audit metadata. Callers are expected to pass ids, counts, field
 * names and short reasons; this drops keys that look like raw content or secrets and redacts
 * personal data in any string that slips through. It never throws.
 */
const FORBIDDEN_KEYS = new Set([
  "input",
  "inputs",
  "output",
  "outputs",
  "prompt",
  "renderedprompt",
  "text",
  "content",
  "body",
  "match",
  "matches",
  "password",
  "passwordhash",
  "token",
  "secret",
  "apikey",
  "email",
]);
const MAX_STRING = 300;
const MAX_ITEMS = 30;
const MAX_DEPTH = 3;

function clean(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const redacted = redactPHI(value, { includeNames: false });
    return redacted.length > MAX_STRING ? `${redacted.slice(0, MAX_STRING)}…` : redacted;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => clean(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) dropped.push(k);
      else if (typeof v !== "function" && v !== undefined) out[k] = clean(v, depth + 1);
    }
    if (dropped.length) out._dropped = dropped;
    return out;
  }
  return null;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return clean(metadata, 0) as Record<string, unknown>;
}
