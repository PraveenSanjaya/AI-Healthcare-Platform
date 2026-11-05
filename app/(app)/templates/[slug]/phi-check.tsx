"use client";

import { highlightSegments, type PhiFindingDto } from "@/lib/safety/inputs";

const LABELS: Record<string, string> = {
  email: "email address",
  phone: "phone number",
  nic: "national ID",
  ssn: "SSN",
  passport: "passport number",
  dob: "date of birth",
  date: "date",
  mrn: "record or patient ID",
  address: "street address",
  postal_code: "postal code",
  name: "name",
};
export const phiLabel = (type: string) => LABELS[type] ?? type;

/** Shown under a field that contains flagged text: the text with matches marked, plus a list. */
export function FieldPhiNotice({ value, findings }: { value: string; findings: PhiFindingDto[] }) {
  if (findings.length === 0) return null;
  const segments = highlightSegments(value, findings);
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">
      <p className="font-medium">
        Possible personal information:{" "}
        {[...new Set(findings.map((f) => phiLabel(f.type)))].join(", ")}
      </p>
      <p className="mt-1 break-words whitespace-pre-wrap" aria-hidden="true">
        {segments.map((s, i) =>
          s.type ? (
            <mark
              key={i}
              className="rounded bg-red-200 px-0.5 text-red-950 underline decoration-wavy"
            >
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

/** Summary above the Generate button, with Redact all and (for admins) the override reason. */
export function PhiSummary({
  findings,
  isAdmin,
  reason,
  onReason,
  onRedactAll,
}: {
  findings: PhiFindingDto[];
  isAdmin: boolean;
  reason: string;
  onReason: (v: string) => void;
  onRedactAll: () => void;
}) {
  if (findings.length === 0) return null;
  const fields = new Set(findings.map((f) => f.field)).size;
  return (
    <div role="status" className="space-y-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-900">
        {findings.length} possible personal detail{findings.length === 1 ? "" : "s"} in {fields}{" "}
        field{fields === 1 ? "" : "s"}. Generate is blocked until they are removed.
      </p>
      <button
        type="button"
        onClick={onRedactAll}
        className="rounded-md border border-red-400 bg-white px-3 py-1.5 font-medium text-red-900"
      >
        Redact all
      </button>
      {isAdmin && (
        <div className="space-y-1">
          <label htmlFor="phi-override-reason" className="block font-medium text-red-900">
            Administrator override: reason (at least 10 characters, logged)
          </label>
          <textarea
            id="phi-override-reason"
            rows={2}
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            className="w-full rounded-md border px-3 py-2 font-normal"
          />
        </div>
      )}
    </div>
  );
}
