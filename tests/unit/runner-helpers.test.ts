import { describe, expect, it } from "vitest";
import { buildFormSchema, defaultValues } from "@/lib/ai/client/form";
import { countWords, lengthStatus } from "@/lib/ai/client/text";
import { describeRetry, failureFrom, readLines } from "@/lib/ai/client/stream";
import { DEFAULT_CLINIC_PROFILE } from "@/lib/ai/profile";
import { findPhiInInputs, highlightSegments, redactAllInputs } from "@/lib/safety/inputs";
import type { TemplateVariable } from "@/lib/templates/types";
import { TEMPLATES } from "@/prisma/seed-data/templates";

const vars: TemplateVariable[] = [
  { name: "clinic_name", label: "Clinic name", type: "text", required: true, fromProfile: true },
  { name: "phone", label: "Phone", type: "text", required: true, fromProfile: true },
  { name: "age", label: "Age", type: "number", required: true },
  {
    name: "tone",
    label: "Tone",
    type: "select",
    required: true,
    options: ["warm", "formal"],
    default: "warm",
  },
  { name: "notes", label: "Notes", type: "textarea", required: false },
];
const profile = { ...DEFAULT_CLINIC_PROFILE, clinicName: "Lakeside Clinic" };

describe("defaultValues", () => {
  it("prefills profile values and template defaults, and leaves the rest empty", () => {
    expect(defaultValues(vars, profile)).toEqual({
      clinic_name: "Lakeside Clinic",
      phone: "",
      age: "",
      tone: "warm",
      notes: "",
    });
  });
  it("prefills F2's emergency number from the profile", () => {
    const f2 = TEMPLATES.find((t) => t.slug === "phone-triage-escalation-guide")!;
    expect(defaultValues(f2.variables, profile).emergency_number).toBe("1990");
  });
  it("uses the template default when the profile value is empty", () => {
    const v: TemplateVariable[] = [
      {
        name: "city",
        label: "City",
        type: "text",
        required: true,
        fromProfile: true,
        default: "Colombo",
      },
    ];
    expect(defaultValues(v, profile)).toEqual({ city: "Colombo" });
  });
});

describe("buildFormSchema", () => {
  const schema = buildFormSchema(vars);
  const ok = { clinic_name: "A", phone: "1", age: "40", tone: "warm", notes: "" };

  it("accepts valid values, including an empty optional field", () => {
    expect(schema.safeParse(ok).success).toBe(true);
  });
  it("requires required fields, with a readable message", () => {
    const r = schema.safeParse({ ...ok, phone: "   " });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Phone is required");
  });
  it("validates numbers", () => {
    expect(schema.safeParse({ ...ok, age: "forty" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, age: "4.5" }).success).toBe(true);
  });
  it("validates select options", () => {
    expect(schema.safeParse({ ...ok, tone: "rude" }).success).toBe(false);
  });
  it("trims values", () => {
    expect(schema.parse({ ...ok, clinic_name: "  A  " }).clinic_name).toBe("A");
  });
  it("builds a schema for every seeded template", () => {
    for (const t of TEMPLATES) {
      const s = buildFormSchema(t.variables);
      const filled = Object.fromEntries(
        t.variables.map((v) => [
          v.name,
          v.type === "number" ? "1" : v.type === "select" ? v.options![0] : "x",
        ]),
      );
      expect(s.safeParse(filled).success, t.slug).toBe(true);
    }
  });
});

describe("text helpers", () => {
  it("counts words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one  two\nthree ")).toBe(3);
  });
  it("warns when over a word or character limit", () => {
    const s = lengthStatus("a b c d e", { maxWords: 3, maxChars: 4 });
    expect(s).toMatchObject({ words: 5, chars: 9, overWords: true, overChars: true });
    expect(s.warning).toBe(
      "2 words over the 3-word limit; 5 characters over the 4-character limit",
    );
  });
  it("does not warn within limits or without limits", () => {
    expect(lengthStatus("a b", { maxWords: 3 }).warning).toBeNull();
    expect(lengthStatus("a b", {}).warning).toBeNull();
    expect(lengthStatus("abc", { maxChars: 3 }).warning).toBeNull();
  });
});

describe("PHI helpers for the runner", () => {
  const inputs = { a: "Call 0771234567", b: "fine", c: "Mr. Kamal Perera" };

  it("tags findings with their field", () => {
    const f = findPhiInInputs(inputs);
    expect(f.map((x) => [x.field, x.type])).toEqual([
      ["a", "phone"],
      ["c", "name"],
    ]);
  });
  it("Redact all removes everything found, names included", () => {
    const out = redactAllInputs(inputs);
    expect(out).toEqual({
      a: "Call [REDACTED-PHONE]",
      b: "fine",
      c: "Mr. [REDACTED-NAME]",
    });
    expect(findPhiInInputs(out)).toEqual([]);
  });
  it("splits text into plain and flagged segments", () => {
    const text = "Call 0771234567 now";
    const segs = highlightSegments(text, findPhiInInputs({ t: text }));
    expect(segs).toEqual([
      { text: "Call " },
      { text: "0771234567", type: "phone" },
      { text: " now" },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });
  it("returns one plain segment when nothing is flagged", () => {
    expect(highlightSegments("hello", [])).toEqual([{ text: "hello" }]);
    expect(highlightSegments("", [])).toEqual([]);
  });
  it("skips overlapping findings", () => {
    const segs = highlightSegments("abcdef", [
      { type: "phone", start: 0, end: 4 },
      { type: "email", start: 2, end: 5 },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe("abcdef");
    expect(segs.filter((s) => s.type)).toHaveLength(1);
  });
});

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe("readLines", () => {
  it("parses NDJSON, including lines split across chunks", async () => {
    const lines = [];
    for await (const l of readLines(
      streamOf([
        '{"type":"text","te',
        'xt":"Hi"}\n{"type":"done"',
        ',"generationId":"g","usage":{}}\n',
      ]),
    )) {
      lines.push(l);
    }
    expect(lines).toEqual([
      { type: "text", text: "Hi" },
      { type: "done", generationId: "g", usage: {} },
    ]);
  });
  it("parses a final line with no newline and skips blanks", async () => {
    const lines = [];
    for await (const l of readLines(streamOf(['\n\n{"type":"text","text":"x"}']))) lines.push(l);
    expect(lines).toEqual([{ type: "text", text: "x" }]);
  });
  it("does not split multi-byte characters across chunks", async () => {
    const bytes = new TextEncoder().encode('{"type":"text","text":"é"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 22));
        c.enqueue(bytes.slice(22));
        c.close();
      },
    });
    const out = [];
    for await (const l of readLines(body)) out.push(l);
    expect(out).toEqual([{ type: "text", text: "é" }]);
  });
});

describe("failureFrom", () => {
  const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

  it("maps statuses to failures", async () => {
    expect(await failureFrom(res(401, {}))).toEqual({ kind: "auth" });
    expect(await failureFrom(res(422, { findings: [{ field: "a" }] }))).toEqual({
      kind: "phi",
      findings: [{ field: "a" }],
    });
    expect(await failureFrom(res(429, { retryAfterSeconds: 120 }))).toEqual({
      kind: "rate-limit",
      retryAfterSeconds: 120,
    });
  });
  it("falls back to the Retry-After header, then to 60 seconds", async () => {
    expect(await failureFrom(res(429, "nope", { "Retry-After": "45" }))).toEqual({
      kind: "rate-limit",
      retryAfterSeconds: 45,
    });
    expect(await failureFrom(res(429, "nope"))).toEqual({
      kind: "rate-limit",
      retryAfterSeconds: 60,
    });
  });
  it("uses the server message when there is one", async () => {
    expect(await failureFrom(res(400, { message: "Missing X" }))).toEqual({
      kind: "message",
      message: "Missing X",
    });
  });
  it("gives a generic message for 404 and other errors", async () => {
    expect((await failureFrom(res(404, {}))).kind).toBe("message");
    expect(await failureFrom(res(500, "<html>"))).toEqual({
      kind: "message",
      message: "The request could not be completed.",
    });
  });
});

describe("describeRetry", () => {
  it("uses seconds for short waits and minutes for long ones", () => {
    expect(describeRetry(30)).toBe("30 seconds");
    expect(describeRetry(1800)).toBe("30 minutes");
    expect(describeRetry(91)).toBe("2 minutes");
  });
});
