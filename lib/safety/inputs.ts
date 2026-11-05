import { detectPHI, redactPHI, type PhiType } from "./phi";

export type PhiFindingDto = {
  field: string;
  type: PhiType;
  match: string;
  start: number;
  end: number;
};

/** Run the detector over every value, tagging each finding with its field name. */
export function findPhiInInputs(inputs: Record<string, string>): PhiFindingDto[] {
  return Object.entries(inputs).flatMap(([field, value]) =>
    detectPHI(value).map((f) => ({ field, ...f })),
  );
}

/** What the "Redact all" button does: every field, names included. */
export function redactAllInputs(inputs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [k, redactPHI(v, { includeNames: true })]),
  );
}

export type Segment = { text: string; type?: PhiType };

/** Split text into plain and flagged runs, for highlighting. Offsets must not overlap. */
export function highlightSegments(
  text: string,
  findings: { type: PhiType; start: number; end: number }[],
): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (f.start < at) continue;
    if (f.start > at) out.push({ text: text.slice(at, f.start) });
    out.push({ text: text.slice(f.start, f.end), type: f.type });
    at = f.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
