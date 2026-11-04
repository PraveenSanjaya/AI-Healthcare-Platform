import Link from "next/link";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>
        Browse the{" "}
        <Link href="/templates" className="underline">
          template library
        </Link>
        . Running templates arrives in Phase 5.
      </p>
    </main>
  );
}
