import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { parseInline, parseMarkdown, plainText } from "@/lib/export/markdown";
import {
  buildDocx,
  buildMarkdown,
  buildPdf,
  isExportFormat,
  type ExportDoc,
} from "@/lib/export/builders";
import { exportAllowed, exportFooter, handleExport, safeFileName } from "@/lib/export/service";
import type { HistoryDetail, HistoryRepo } from "@/lib/history/service";
import type { AuditEntry } from "@/lib/audit/actions";

const doc: ExportDoc = {
  title: "Staff Spotlight",
  body: "# Staff Spotlight\n\nDr. **Perera** is a *cardiologist*.\n\n- First point\n- Second point\n\n1. One\n2. Two\n\n| a | b |\n|---|---|\n| 1 | 2 |",
  footer: "AI draft — reviewed by Nimali on 2026-11-05",
};

describe("parseInline / parseMarkdown", () => {
  it("reads bold, italic and code runs", () => {
    expect(parseInline("a **b** *c* `d` e")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
      { text: " e" },
    ]);
  });
  it("leaves unmatched markers as text", () => {
    expect(plainText(parseInline("2 * 3 and **open"))).toBe("2 * 3 and **open");
  });
  it("returns one empty run for an empty line", () => {
    expect(parseInline("")).toEqual([{ text: "" }]);
  });
  it("reads headings, paragraphs, bullets, numbers and table rows", () => {
    const blocks = parseMarkdown(doc.body);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "bullet",
      "bullet",
      "number",
      "number",
      "paragraph",
      "paragraph",
    ]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[5]).toMatchObject({ type: "number", n: 2 });
    expect(plainText(blocks[6].runs)).toContain("a  |  b");
  });
  it("joins wrapped lines into one paragraph and ignores rules and fences", () => {
    const blocks = parseMarkdown("one\ntwo\n\n---\n\n```\ncode\n```");
    expect(blocks).toHaveLength(2);
    expect(plainText(blocks[0].runs)).toBe("one two");
  });
  it("handles CRLF and empty input", () => {
    expect(parseMarkdown("a\r\n\r\nb")).toHaveLength(2);
    expect(parseMarkdown("")).toEqual([]);
  });
});

describe("builders", () => {
  it("builds Markdown with the footer", () => {
    const md = buildMarkdown(doc);
    expect(md.startsWith("# Staff Spotlight")).toBe(true);
    expect(md.trimEnd().endsWith("*AI draft — reviewed by Nimali on 2026-11-05*")).toBe(true);
  });
  it("builds a .docx zip whose text holds the draft and the footer", async () => {
    const bytes = await buildDocx(doc);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // "PK"
    const files = unzipSync(bytes);
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Perera");
    expect(xml).toContain("First point");
    expect(xml).toContain("AI draft — reviewed by Nimali on 2026-11-05");
    const footer = Object.keys(files).find((f) => f.startsWith("word/footer"));
    expect(footer).toBeTruthy();
    expect(strFromU8(files[footer!])).toContain("AI draft");
  });
  it("builds a readable .pdf", async () => {
    const bytes = await buildPdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Staff Spotlight");
  });
  it("paginates a long draft and still renders", async () => {
    const long = Array.from({ length: 160 }, (_, i) => `Paragraph ${i} ${"word ".repeat(30)}`).join(
      "\n\n",
    );
    const pdf = await PDFDocument.load(await buildPdf({ ...doc, body: long }));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });
  it("does not fail on characters the built-in PDF fonts lack", async () => {
    const bytes = await buildPdf({ ...doc, body: "සිංහල text, emoji 😀 and café" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it("validates formats", () => {
    expect(["md", "docx", "pdf"].every(isExportFormat)).toBe(true);
    expect(isExportFormat("exe")).toBe(false);
    expect(isExportFormat(null)).toBe(false);
  });
});

describe("footer, gate and file names", () => {
  const reviewedAt = new Date("2026-11-05T09:30:00Z");
  it("names the reviewer and date for reviewed drafts", () => {
    expect(exportFooter({ reviewed: true, reviewedAt, userName: "Nimali" })).toBe(
      "AI draft — reviewed by Nimali on 2026-11-05",
    );
  });
  it("says not reviewed otherwise", () => {
    expect(exportFooter({ reviewed: false, reviewedAt: null, userName: "Nimali" })).toBe(
      "AI draft — not reviewed",
    );
    expect(exportFooter({ reviewed: true, reviewedAt: null, userName: "Nimali" })).toBe(
      "AI draft — not reviewed",
    );
  });
  it("allows internal drafts at once and patient-facing ones only when reviewed", () => {
    expect(exportAllowed({ audience: "INTERNAL", reviewed: false })).toBe(true);
    expect(exportAllowed({ audience: "PATIENT_FACING", reviewed: false })).toBe(false);
    expect(exportAllowed({ audience: "PATIENT_FACING", reviewed: true })).toBe(true);
  });
  it("makes safe file names", () => {
    expect(
      safeFileName("Plain-Language Test Result Explainer!", "cmw36n8110000pkuf", "pdf", reviewedAt),
    ).toBe(
      "plain-language-test-result-explainer-2026-11-05-0pkuf.pdf".replace(
        "0pkuf",
        "000pkuf".slice(-6),
      ),
    );
    expect(safeFileName("???", "abc", "md", reviewedAt)).toBe("draft-2026-11-05-abc.md");
  });
});

function detail(over: Partial<HistoryDetail> = {}): HistoryDetail {
  return {
    id: "gen123456",
    createdAt: new Date("2026-11-05T08:00:00Z"),
    userId: "alice",
    userName: "Alice",
    templateSlug: "t",
    templateTitle: "Reply",
    audience: "INTERNAL",
    reviewed: false,
    reviewedAt: null,
    templateVersion: 1,
    model: "mock-1",
    inputs: {},
    output: "# Reply\n\nfirst",
    refinements: [],
    ...over,
  };
}

function deps(d: HistoryDetail | null) {
  const audit: AuditEntry[] = [];
  const history: HistoryRepo = {
    list: async () => ({ rows: [], total: 0 }),
    get: async () => d,
    templateOptions: async () => [],
  };
  return {
    audit,
    deps: {
      history,
      audit: async (e: AuditEntry) => {
        audit.push(e);
      },
      now: () => new Date("2026-11-06T00:00:00Z"),
    },
  };
}
const as = (role: string, id: string) => ({ user: { id, role } });

describe("handleExport", () => {
  it("requires sign-in", async () => {
    expect((await handleExport(deps(detail()).deps, null, "g", "pdf")).status).toBe(401);
  });
  it("rejects an unknown format before touching the data", async () => {
    const res = await handleExport(deps(detail()).deps, as("STAFF", "alice"), "g", "exe");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_FORMAT");
  });
  it("hides other people's drafts from STAFF as not found", async () => {
    const res = await handleExport(deps(detail()).deps, as("STAFF", "bob"), "g", "md");
    expect(res.status).toBe(404);
  });
  it("returns 404 for a missing draft", async () => {
    expect((await handleExport(deps(null).deps, as("ADMIN", "a"), "g", "md")).status).toBe(404);
  });
  it("blocks an unreviewed patient-facing draft for every role", async () => {
    for (const role of ["STAFF", "MANAGER", "ADMIN"]) {
      const { deps: d, audit } = deps(detail({ audience: "PATIENT_FACING" }));
      for (const f of ["md", "docx", "pdf"]) {
        const res = await handleExport(d, as(role, "alice"), "g", f);
        expect(res.status, `${role} ${f}`).toBe(409);
        expect((await res.json()).error).toBe("REVIEW_REQUIRED");
      }
      expect(audit).toEqual([]);
    }
  });
  it("allows a reviewed patient-facing draft, with the reviewer in the footer", async () => {
    const { deps: d, audit } = deps(
      detail({
        audience: "PATIENT_FACING",
        reviewed: true,
        reviewedAt: new Date("2026-11-05T09:00:00Z"),
      }),
    );
    const res = await handleExport(d, as("STAFF", "alice"), "g", "md");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI draft — reviewed by Alice on 2026-11-05");
    expect(audit).toHaveLength(1);
  });
  it("allows an unreviewed internal draft, marked not reviewed", async () => {
    const res = await handleExport(deps(detail()).deps, as("STAFF", "alice"), "g", "md");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI draft — not reviewed");
  });
  it("exports the latest refinement, not the first output", async () => {
    const d = detail({
      refinements: [{ id: "r", instruction: "x", output: "refined text", createdAt: new Date() }],
    });
    const text = await (await handleExport(deps(d).deps, as("STAFF", "alice"), "g", "md")).text();
    expect(text).toContain("refined text");
    expect(text).not.toContain("first");
  });
  it("lets a manager export someone else's internal draft", async () => {
    expect((await handleExport(deps(detail()).deps, as("MANAGER", "m"), "g", "md")).status).toBe(
      200,
    );
  });
  it("sets download headers and audits EXPORTED without any draft text", async () => {
    const { deps: d, audit } = deps(detail());
    const res = await handleExport(d, as("STAFF", "alice"), "g", "pdf");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reply-2026-11-06-123456.pdf"',
    );
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect(audit[0]).toMatchObject({
      action: "EXPORTED",
      actorId: "alice",
      entityType: "Generation",
      entityId: "gen123456",
      metadata: { format: "pdf", templateSlug: "t", reviewed: false },
    });
    expect(JSON.stringify(audit)).not.toContain("first");
  });
  it("serves a docx with the right content type", async () => {
    const res = await handleExport(deps(detail()).deps, as("STAFF", "alice"), "g", "docx");
    expect(res.headers.get("Content-Type")).toContain("wordprocessingml");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
});
