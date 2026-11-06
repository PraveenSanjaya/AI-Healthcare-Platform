"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest lets an administrator find the matching server log line; no details are shown.
    console.error("Page error", error.digest ?? "");
  }, [error]);
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6" id="main">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        The page could not be shown. Your work is saved up to the last step that completed.
      </p>
      {error.digest && <p className="text-muted-foreground text-sm">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground rounded-md px-3 py-2"
        >
          Try again
        </button>
        <a href="/dashboard" className="rounded-md border px-3 py-2">
          Go to dashboard
        </a>
      </div>
    </main>
  );
}
