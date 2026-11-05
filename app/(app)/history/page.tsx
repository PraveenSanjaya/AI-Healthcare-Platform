import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaHistoryRepo } from "@/lib/history/repo";
import { listHistory, parseHistoryFilters } from "@/lib/history/service";

export const metadata = { title: "History" };

type Search = Record<string, string | string[] | undefined>;

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

function pageHref(sp: Search, page: number) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "page") q.set(k, val);
  }
  q.set("page", String(page));
  return `/history?${q.toString()}`;
}

async function History({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const filters = parseHistoryFilters(sp);
  const session = await auth();
  let result;
  try {
    result = await listHistory(session, prismaHistoryRepo, filters);
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }
  const showUser = result.scope === "all";
  return (
    <>
      <p className="text-sm text-gray-600" data-testid="history-scope">
        {result.scope === "all" ? "All users' drafts" : "Your drafts"} · {result.total} found
      </p>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          Template
          <select
            name="template"
            defaultValue={filters.template ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            {result.templates.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Review status
          <select
            name="reviewed"
            defaultValue={filters.reviewed ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">Any</option>
            <option value="yes">Reviewed</option>
            <option value="no">Not reviewed</option>
          </select>
        </label>
        <button className="rounded-md bg-black px-3 py-2 text-white">Filter</button>
        <Link href="/history" className="px-2 py-2 text-sm underline">
          Clear
        </Link>
      </form>
      {result.rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-gray-600">
          No drafts match. Run a template to create one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Generated drafts</caption>
            <thead>
              <tr className="border-b">
                <th className="p-2">Date</th>
                <th className="p-2">Template</th>
                {showUser && <th className="p-2">User</th>}
                <th className="p-2">Review</th>
                <th className="p-2">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  <td className="p-2">
                    {r.templateTitle}
                    {r.audience === "PATIENT_FACING" && (
                      <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-900">
                        Patient-facing
                      </span>
                    )}
                  </td>
                  {showUser && <td className="p-2">{r.userName}</td>}
                  <td className="p-2">{r.reviewed ? "Reviewed" : "Not reviewed"}</td>
                  <td className="p-2">
                    <Link href={`/history/${r.id}`} className="underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-4 text-sm">
          {result.page > 1 && (
            <Link href={pageHref(sp, result.page - 1)} className="underline">
              Previous
            </Link>
          )}
          <span>
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages && (
            <Link href={pageHref(sp, result.page + 1)} className="underline">
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">History</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <History searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
