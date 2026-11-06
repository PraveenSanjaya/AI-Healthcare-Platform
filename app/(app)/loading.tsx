export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="p-6">
      <div className="bg-muted h-6 w-48 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-24 max-w-2xl animate-pulse rounded" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
