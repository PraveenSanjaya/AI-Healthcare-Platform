/** Largest JSON body accepted by /api/generate (inputs are capped per field as well). */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

export type JsonBody = { ok: true; body: unknown } | { ok: false; status: 400 | 413 };

/**
 * Read a JSON request body without trusting Content-Length: the stream is counted and
 * abandoned once it passes the limit.
 */
export async function readJsonLimited(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(Buffer.from(value));
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** One error shape for every API route; never includes a stack or internal detail. */
export function errorResponse(status: number, error: string, message?: string): Response {
  return Response.json(message ? { error, message } : { error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
