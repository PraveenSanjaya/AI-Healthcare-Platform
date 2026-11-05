"use client";

import { useState, useTransition } from "react";
import { canCopy } from "@/lib/ai/review";
import { redactPHI } from "@/lib/safety/phi";
import { findPhiInInputs } from "@/lib/safety/inputs";
import { reviewGenerationAction } from "../actions";
import { FieldPhiNotice } from "./phi-check";

export type DraftActionsProps = {
  audience: "INTERNAL" | "PATIENT_FACING";
  draft: string;
  /** True once a draft has finished streaming and was saved. */
  ready: boolean;
  generationId: string | null;
  reviewed: boolean;
  onReviewed: () => void;
  busy: boolean;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
  onRefine: (instruction: string) => void;
  /** A valid administrator override reason is entered (applies to the instruction too). */
  overrideActive: boolean;
  refinements: string[];
};

export function DraftActions(p: DraftActionsProps) {
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const patientFacing = p.audience === "PATIENT_FACING";
  const copyAllowed = p.ready && canCopy(p.audience, p.reviewed);
  const exportAllowed = p.ready && p.generationId !== null && canCopy(p.audience, p.reviewed);
  const findings = findPhiInInputs({ instruction });
  const refineBlocked = findings.length > 0 && !p.overrideActive;

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.draft);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  function review() {
    if (!p.generationId) return;
    const id = p.generationId;
    start(async () => {
      const r = await reviewGenerationAction(id);
      if (r.ok) {
        setReviewError(null);
        p.onReviewed();
      } else setReviewError(r.error);
    });
  }

  function submitRefine(e: React.FormEvent) {
    e.preventDefault();
    const text = instruction.trim();
    if (!text || refineBlocked) return;
    p.onRefine(text);
    setInstruction("");
  }

  return (
    <section aria-label="Draft actions" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={p.onRegenerate}
          disabled={p.busy || p.regenerateDisabled}
          className="rounded-md border px-3 py-2 disabled:opacity-50"
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!copyAllowed}
          className="rounded-md border px-3 py-2 disabled:opacity-50"
        >
          Copy
        </button>
        {copied === "done" && (
          <span role="status" className="text-sm text-green-800">
            Copied
          </span>
        )}
        {copied === "failed" && (
          <span role="alert" className="text-sm text-red-700">
            Copy failed. Select the text and copy it manually.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Export">
        <span className="font-medium">Export</span>
        {(["md", "docx", "pdf"] as const).map((f) =>
          exportAllowed ? (
            <a
              key={f}
              href={`/api/export/${p.generationId}?format=${f}`}
              download
              className="rounded-md border px-3 py-1.5"
            >
              .{f}
            </a>
          ) : (
            <button
              key={f}
              type="button"
              disabled
              className="rounded-md border px-3 py-1.5 opacity-50"
            >
              .{f}
            </button>
          ),
        )}
        {patientFacing && !p.reviewed && (
          <span className="text-gray-600">Review the draft to enable export.</span>
        )}
      </div>

      {patientFacing && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={p.reviewed}
              disabled={!p.ready || p.reviewed || pending}
              onChange={review}
            />
            I have reviewed this
          </label>
          {!p.reviewed && (
            <p className="text-sm text-gray-600">
              This is patient-facing text. Copy stays disabled until you have read it and ticked the
              box.
            </p>
          )}
          {reviewError && (
            <p role="alert" className="text-sm text-red-700">
              {reviewError}
            </p>
          )}
        </div>
      )}

      <form onSubmit={submitRefine} className="space-y-2" noValidate>
        <label htmlFor="refine-instruction" className="block text-sm font-medium">
          Refine this draft
        </label>
        <textarea
          id="refine-instruction"
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={!p.ready || p.busy}
          placeholder="For example: make it shorter and friendlier"
          className="w-full rounded-md border px-3 py-2"
        />
        <FieldPhiNotice value={instruction} findings={findings} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!p.ready || p.busy || !instruction.trim() || refineBlocked}
            className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            Refine
          </button>
          {findings.length > 0 && (
            <button
              type="button"
              onClick={() => setInstruction(redactPHI(instruction, { includeNames: true }))}
              className="rounded-md border border-red-400 px-3 py-2 text-red-900"
            >
              Redact all
            </button>
          )}
        </div>
      </form>

      {p.refinements.length > 0 && (
        <div className="text-sm">
          <h3 className="font-medium">Refinements applied</h3>
          <ol className="ml-5 list-decimal">
            {p.refinements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
