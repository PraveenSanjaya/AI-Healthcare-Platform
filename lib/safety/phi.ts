/**
 * Heuristic PHI/PII detector. A safeguard, not a guarantee: see docs/SAFETY.md.
 * Pure functions only: no I/O, no state.
 */

export const PHI_TYPES = [
  "email",
  "phone",
  "nic",
  "ssn",
  "passport",
  "dob",
  "date",
  "mrn",
  "address",
  "postal_code",
  "name",
] as const;

export type PhiType = (typeof PHI_TYPES)[number];

export type PhiFinding = { type: PhiType; match: string; start: number; end: number };

type Rule = {
  type: PhiType;
  re: RegExp;
  /** Capture group to report instead of the whole match (the rest is only a cue). */
  group?: number;
  /** Reject a candidate (for example a common word after a name cue). */
  reject?: (value: string) => boolean;
};

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_BODY =
  String.raw`(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}` +
  String.raw`|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})` +
  String.raw`|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}\.?,?\s+\d{4}` +
  String.raw`|${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`;

const NAME_WORD = "[A-Z][A-Za-z'’-]+";
const NAME = String.raw`${NAME_WORD}(?:\s+${NAME_WORD}){0,2}`;
const NAME_STOPWORDS = new Set([
  "id",
  "number",
  "name",
  "date",
  "portal",
  "education",
  "experience",
  "satisfaction",
  "survey",
  "care",
  "relations",
  "safety",
  "records",
  "information",
]);

const STREET =
  "(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Boulevard|Blvd|Mawatha|Place|Pl|Way|Court|Ct|Gardens|Terrace|Close|Crescent)";

const RULES: Rule[] = [
  { type: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // international: +94 77 123 4567, +1 (555) 123-4567
  { type: "phone", re: /(?<![\w+])\+\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){1,4}(?!\d)/g },
  // Sri Lankan local: 07X XXX XXXX and landlines such as 011 234 5678
  { type: "phone", re: /(?<![\w+])0\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g },
  // North American: (555) 123-4567, 555-123-4567
  { type: "phone", re: /(?<![\w+])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g },
  // NIC: old 9 digits + V/X, new 12 digits starting with a birth year
  { type: "nic", re: /(?<![\w-])\d{9}[VvXx](?![\w])/g },
  { type: "nic", re: /(?<![\w-])(?:19|20)\d{10}(?!\d)/g },
  { type: "ssn", re: /(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g },
  {
    type: "passport",
    re: /\bpassport(?:\s*(?:no\.?|number|#))?\s*[:#-]?\s*([A-Z0-9]{6,9})\b/gi,
    group: 1,
    reject: (v) => !/\d/.test(v),
  },
  { type: "passport", re: /(?<![\w-])[A-Z]{1,2}\d{6,8}(?![\w])/g },
  {
    type: "dob",
    re: new RegExp(
      String.raw`\b(?:DOB|D\.O\.B\.?|date\s+of\s+birth|born(?:\s+on)?)\s*[:\-]?\s*${DATE_BODY}`,
      "gi",
    ),
  },
  { type: "dob", re: /\bborn\s+(?:in\s+)?(?:19|20)\d{2}\b/gi },
  { type: "date", re: new RegExp(String.raw`(?<![\d.])${DATE_BODY}(?!\d|\.\d)`, "gi") },
  {
    type: "mrn",
    re: /\b(?:MRN|MR#|medical\s+record(?:\s+(?:number|no\.?|#))?|(?:patient|record|chart)\s*(?:ID|no\.?|number|#))\s*[:#-]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,}\b/gi,
  },
  {
    type: "address",
    re: new RegExp(
      String.raw`(?<![\w/])(?:No\.?\s*)?\d{1,5}[A-Za-z]?(?:/\d{1,3})?,?\s+(?:[A-Z][\w.'’-]*\s+){1,3}${STREET}\b\.?`,
      "g",
    ),
  },
  {
    type: "postal_code",
    re: /\b(?:postal\s+code|post\s*code|zip(?:\s+code)?)\s*[:#]?\s*(\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/gi,
    group: 1,
  },
  { type: "postal_code", re: /(?<![\w-])\d{5}-\d{4}(?![\w-])/g },
  { type: "postal_code", re: /(?<![\w-])[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}(?![\w])/g },
  // names near cues: flagged, never auto-redacted (too error-prone)
  {
    type: "name",
    re: new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+(${NAME})`, "g"),
    group: 1,
  },
  {
    type: "name",
    re: new RegExp(
      String.raw`\b(?:[Pp]atient(?:\s+[Nn]ame)?|[Nn]ame|[Ff]ull\s+[Nn]ame)\s*(?::|\bis\b|\bnamed\b)\s*(${NAME})`,
      "g",
    ),
    group: 1,
  },
  {
    type: "name",
    re: new RegExp(String.raw`\b[Pp]atient\s+(${NAME_WORD}(?:\s+${NAME_WORD})?)`, "g"),
    group: 1,
  },
];

/** Priority when two findings cover equal length: earlier in this list wins. */
const PRIORITY = new Map<PhiType, number>(PHI_TYPES.map((t, i) => [t, i]));

const PLACEHOLDER_RE = /\{\{[^{}]*\}\}|\[[^[\]\d]*\]/g;

function placeholderRanges(text: string): Array<[number, number]> {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => [m.index, m.index + m[0].length]);
}

export function detectPHI(text: string): PhiFinding[] {
  if (!text) return [];
  const skip = placeholderRanges(text);
  const candidates: PhiFinding[] = [];

  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const value = rule.group ? m[rule.group] : m[0];
      if (!value) continue;
      if (rule.type === "name" && NAME_STOPWORDS.has(value.split(/\s+/)[0].toLowerCase())) continue;
      if (rule.reject?.(value)) continue;
      const start = rule.group ? m.index + m[0].lastIndexOf(value) : m.index;
      candidates.push({ type: rule.type, match: value, start, end: start + value.length });
    }
  }

  const usable = candidates.filter((c) => !skip.some(([s, e]) => c.start < e && c.end > s));
  // Longest wins; ties go to the more specific type; then leftmost.
  usable.sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      (PRIORITY.get(a.type) ?? 0) - (PRIORITY.get(b.type) ?? 0) ||
      a.start - b.start,
  );
  const accepted: PhiFinding[] = [];
  for (const c of usable) {
    if (!accepted.some((a) => c.start < a.end && c.end > a.start)) accepted.push(c);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

const label = (t: PhiType) => `[REDACTED-${t.toUpperCase().replace(/_/g, "-")}]`;

/**
 * Replace findings with [REDACTED-TYPE]. Names are heuristic and only flagged by
 * detectPHI, so they are left in place unless `includeNames` is set.
 */
export function redactPHI(text: string, opts: { includeNames?: boolean } = {}): string {
  const findings = detectPHI(text).filter((f) => opts.includeNames || f.type !== "name");
  let out = text;
  for (const f of [...findings].reverse()) {
    out = out.slice(0, f.start) + label(f.type) + out.slice(f.end);
  }
  return out;
}
