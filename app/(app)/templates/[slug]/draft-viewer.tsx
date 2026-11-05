"use client";

import Markdown from "react-markdown";

/** The streamed draft. The review label is always present, even while empty or streaming. */
export function DraftViewer({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <section aria-label="Generated draft" className="space-y-2">
      <p className="inline-block rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">
        AI draft — review before use
      </p>
      <div
        aria-live="polite"
        aria-busy={streaming}
        className="min-h-24 space-y-3 rounded-lg border p-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_table]:border [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2"
      >
        {text ? (
          <Markdown>{text}</Markdown>
        ) : (
          <p className="text-gray-600">{streaming ? "Writing…" : "Your draft will appear here."}</p>
        )}
      </div>
    </section>
  );
}
