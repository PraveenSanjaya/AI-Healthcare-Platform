"use client";

/** Last resort: replaces the root layout, so it brings its own html and body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "36rem" }}>
        <main>
          <h1>Something went wrong</h1>
          <p>ClinicAssist hit an unexpected problem. Please try again.</p>
          {error.digest && <p>Reference: {error.digest}</p>}
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
