import type { PhiFindingDto } from "@/lib/safety/inputs";
import type { StreamLine } from "../generate";

export type GenerateRequestBody =
  | { slug: string; inputs: Record<string, string>; override?: { reason: string } }
  | { slug: string; generationId: string; instruction: string; override?: { reason: string } };

/** A request that failed before streaming started, in terms the UI can show. */
export type GenerateFailure =
  | { kind: "phi"; findings: PhiFindingDto[] }
  | { kind: "rate-limit"; retryAfterSeconds: number }
  | { kind: "auth" }
  | { kind: "message"; message: string };

/** Parse an NDJSON body into lines, tolerating chunks that split a line. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line) as StreamLine;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as StreamLine;
  } finally {
    reader.releaseLock();
  }
}

/** Turn a non-OK response from /api/generate into a failure the UI understands. */
export async function failureFrom(res: Response): Promise<GenerateFailure> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return { kind: "auth" };
  if (res.status === 422 && Array.isArray(body.findings)) {
    return { kind: "phi", findings: body.findings as PhiFindingDto[] };
  }
  if (res.status === 429) {
    const retry = Number(body.retryAfterSeconds ?? res.headers.get("Retry-After") ?? 60);
    return { kind: "rate-limit", retryAfterSeconds: Number.isFinite(retry) ? retry : 60 };
  }
  const message =
    typeof body.message === "string"
      ? body.message
      : res.status === 404
        ? "That template or draft is no longer available."
        : "The request could not be completed.";
  return { kind: "message", message };
}

export const describeRetry = (seconds: number) =>
  seconds < 90 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`;
