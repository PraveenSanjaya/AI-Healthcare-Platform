/** A deliberately small Markdown reader: enough for model drafts, shared by the .docx and .pdf builders. */

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { type: "heading"; level: number; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "bullet"; runs: Run[] }
  | { type: "number"; n: number; runs: Run[] };

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;

/** Split a line into runs: **bold**, *italic*, `code`. Unmatched markers stay as text. */
export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) runs.push({ text: text.slice(at, m.index) });
    const t = m[0];
    if (t.startsWith("**") || t.startsWith("__")) runs.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) runs.push({ text: t.slice(1, -1), code: true });
    else runs.push({ text: t.slice(1, -1), italic: true });
    at = m.index + t.length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs.length ? runs : [{ text: "" }];
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", runs: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || /^```/.test(line.trim())) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const b = /^\s*[-*+]\s+(.*)$/.exec(line);
    const n = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: "heading", level: h[1].length, runs: parseInline(h[2]) });
    } else if (b) {
      flush();
      blocks.push({ type: "bullet", runs: parseInline(b[1]) });
    } else if (n) {
      flush();
      blocks.push({ type: "number", n: Number(n[1]), runs: parseInline(n[2]) });
    } else if (/^\s*\|/.test(line)) {
      // Tables are kept as readable text rows, one per line.
      flush();
      if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) {
        blocks.push({
          type: "paragraph",
          runs: [{ text: line.replace(/^\s*\||\|\s*$/g, "").replace(/\s*\|\s*/g, "  |  ") }],
        });
      }
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export const plainText = (runs: Run[]) => runs.map((r) => r.text).join("");
