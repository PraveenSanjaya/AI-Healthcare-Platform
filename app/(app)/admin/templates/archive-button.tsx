"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveTemplateAction } from "./actions";

export function ArchiveButton({ slug, archived }: { slug: string; archived: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await archiveTemplateAction(slug, !archived);
            if (r.ok) {
              setError(null);
              router.refresh();
            } else setError(r.error ?? "Failed");
          })
        }
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        {archived ? "Unarchive" : "Archive"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
