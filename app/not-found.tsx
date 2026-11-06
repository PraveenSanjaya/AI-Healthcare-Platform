import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6" id="main">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        That page does not exist, or you do not have access to it.
      </p>
      <Link href="/dashboard" className="inline-block rounded-md border px-3 py-2">
        Go to dashboard
      </Link>
    </main>
  );
}
