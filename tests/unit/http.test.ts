import { describe, expect, it } from "vitest";
import { errorResponse, readJsonLimited } from "@/lib/http/body";
import { securityHeaders } from "@/lib/http/headers";

const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

describe("securityHeaders", () => {
  it("sets the core headers in production, including HSTS and no eval", () => {
    const h = securityHeaders({ NODE_ENV: "production" });
    expect(get(h, "X-Frame-Options")).toBe("DENY");
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get(h, "Permissions-Policy")).toContain("camera=()");
    expect(get(h, "Strict-Transport-Security")).toContain("max-age=");
    const csp = get(h, "Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("omits HSTS in development and allows eval for React's dev tooling", () => {
    const h = securityHeaders({ NODE_ENV: "development" });
    expect(get(h, "Strict-Transport-Security")).toBeUndefined();
    expect(get(h, "Content-Security-Policy")).toContain("unsafe-eval");
  });
});

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", body, headers });

describe("readJsonLimited", () => {
  it("parses a small body", async () => {
    expect(await readJsonLimited(post('{"a":1}'))).toEqual({ ok: true, body: { a: 1 } });
  });
  it("rejects bad JSON with 400", async () => {
    expect(await readJsonLimited(post("{nope"))).toEqual({ ok: false, status: 400 });
  });
  it("rejects an empty body with 400", async () => {
    expect(await readJsonLimited(new Request("http://x/api", { method: "POST" }))).toEqual({
      ok: false,
      status: 400,
    });
  });
  it("rejects a declared oversized body with 413", async () => {
    const r = await readJsonLimited(post("{}", { "content-length": "999999" }), 100);
    expect(r).toEqual({ ok: false, status: 413 });
  });
  it("rejects an oversized body even when Content-Length is missing or wrong", async () => {
    const big = JSON.stringify({ x: "a".repeat(500) });
    expect(await readJsonLimited(post(big), 100)).toEqual({ ok: false, status: 413 });
  });
});

describe("errorResponse", () => {
  it("returns a no-store JSON error without internals", async () => {
    const res = errorResponse(500, "INTERNAL_ERROR", "Something went wrong.");
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "INTERNAL_ERROR", message: "Something went wrong." });
  });
});
