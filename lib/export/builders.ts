import { AlignmentType, Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { parseMarkdown, plainText, type Block, type Run } from "./markdown";

export type ExportDoc = {
  title: string;
  /** The draft, as Markdown. */
  body: string;
  /** Printed on every export, e.g. "AI draft — reviewed by Nimali on 2026-11-05". */
  footer: string;
};

export type ExportFormat = "md" | "docx" | "pdf";

export const FORMAT_INFO: Record<ExportFormat, { ext: string; contentType: string }> = {
  md: { ext: "md", contentType: "text/markdown; charset=utf-8" },
  docx: {
    ext: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  pdf: { ext: "pdf", contentType: "application/pdf" },
};

export const isExportFormat = (v: unknown): v is ExportFormat =>
  v === "md" || v === "docx" || v === "pdf";

export function buildMarkdown(doc: ExportDoc): string {
  return `${doc.body.trimEnd()}\n\n---\n\n*${doc.footer}*\n`;
}

// ---------- .docx ----------

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const runsToDocx = (runs: Run[]) =>
  runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        font: r.code ? "Consolas" : undefined,
      }),
  );

function blockToDocx(b: Block): Paragraph {
  switch (b.type) {
    case "heading":
      return new Paragraph({
        heading: HEADINGS[Math.min(b.level, 6) - 1],
        children: runsToDocx(b.runs),
      });
    case "bullet":
      return new Paragraph({ bullet: { level: 0 }, children: runsToDocx(b.runs) });
    case "number":
      return new Paragraph({
        indent: { left: 360 },
        children: [new TextRun(`${b.n}. `), ...runsToDocx(b.runs)],
      });
    default:
      return new Paragraph({ spacing: { after: 120 }, children: runsToDocx(b.runs) });
  }
}

export async function buildDocx(doc: ExportDoc): Promise<Uint8Array> {
  const footerParagraph = () =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: doc.footer, italics: true, size: 18 })],
    });
  const file = new Document({
    title: doc.title,
    creator: "ClinicAssist",
    sections: [
      {
        footers: { default: new Footer({ children: [footerParagraph()] }) },
        children: [...parseMarkdown(doc.body).map(blockToDocx), footerParagraph()],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(file));
}

// ---------- .pdf ----------

const PAGE = { w: 595.28, h: 841.89, margin: 56 };

type Word = { text: string; font: PDFFont; width: number };

/** The built-in PDF fonts only cover Latin-1 text; anything else becomes "?". */
function sanitizer(font: PDFFont) {
  const cache = new Map<string, string>();
  return (text: string) =>
    Array.from(text.normalize("NFC"), (ch) => {
      let out = cache.get(ch);
      if (out === undefined) {
        try {
          font.encodeText(ch);
          out = ch;
        } catch {
          out = "?";
        }
        cache.set(ch, out);
      }
      return out;
    })
      .join("")
      .replace(/\s+/g, " ");
}

export async function buildPdf(doc: ExportDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator("ClinicAssist");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const clean = sanitizer(regular);
  const fontFor = (r: Run, heading: boolean) =>
    heading || r.bold ? bold : r.italic ? italic : r.code ? mono : regular;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const maxWidth = PAGE.w - PAGE.margin * 2;
  const bottom = PAGE.margin + 24; // room for the footer

  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - PAGE.margin;
  };

  function writeRuns(
    runs: Run[],
    size: number,
    opts: { heading?: boolean; indent?: number; prefix?: string } = {},
  ) {
    const lineHeight = size * 1.4;
    const words: Word[] = [];
    if (opts.prefix) {
      const font = regular;
      words.push({ text: opts.prefix, font, width: font.widthOfTextAtSize(opts.prefix, size) });
    }
    for (const r of runs) {
      const font = fontFor(r, Boolean(opts.heading));
      for (const w of clean(r.text).split(" ")) {
        if (w) words.push({ text: w, font, width: font.widthOfTextAtSize(w, size) });
      }
    }
    const indent = opts.indent ?? 0;
    let x = PAGE.margin + indent;
    const startX = x;
    if (y - lineHeight < bottom) newPage();
    for (const [i, w] of words.entries()) {
      const space = i === 0 || (opts.prefix && i === 1) ? 0 : regular.widthOfTextAtSize(" ", size);
      if (x + space + w.width > PAGE.margin + maxWidth && x > startX) {
        y -= lineHeight;
        if (y - lineHeight < bottom) newPage();
        x = startX;
      } else {
        x += space;
      }
      page.drawText(w.text, { x, y: y - size, size, font: w.font, color: rgb(0, 0, 0) });
      x += w.width;
    }
    y -= lineHeight;
  }

  const SIZES = [20, 16, 13, 12, 11, 11];
  for (const b of parseMarkdown(doc.body)) {
    if (b.type === "heading") {
      y -= 6;
      writeRuns(b.runs, SIZES[Math.min(b.level, 6) - 1], { heading: true });
      y -= 2;
    } else if (b.type === "bullet") {
      writeRuns(b.runs, 11, { indent: 14, prefix: "-  " });
    } else if (b.type === "number") {
      writeRuns(b.runs, 11, { indent: 14, prefix: `${b.n}.  ` });
    } else {
      writeRuns(b.runs, 11);
      y -= 4;
    }
  }

  // Footer on every page, with page numbers.
  const pages = pdf.getPages();
  const footerText = clean(doc.footer);
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: PAGE.margin, y: PAGE.margin + 14 },
      end: { x: PAGE.w - PAGE.margin, y: PAGE.margin + 14 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    p.drawText(footerText, {
      x: PAGE.margin,
      y: PAGE.margin,
      size: 9,
      font: italic,
      color: rgb(0.25, 0.25, 0.25),
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE.w - PAGE.margin - regular.widthOfTextAtSize(label, 9),
      y: PAGE.margin,
      size: 9,
      font: regular,
      color: rgb(0.25, 0.25, 0.25),
    });
  });
  return pdf.save();
}

export { plainText };
