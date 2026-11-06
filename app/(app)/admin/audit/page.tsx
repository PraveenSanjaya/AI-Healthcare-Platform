import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { auditRepo } from "@/lib/audit/repo";
import { listAudit, parseAuditFilters } from "@/lib/audit/service";

export const metadata = { title: "Audit log" };

type Search = Record<string, string | string[] | undefined>;

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ") + " UTC";

function query(sp: Search, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  for (const k of ["action", "actor", "from", "to"]) {
    const v = Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined);
    if (v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

async function Audit({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const filters = parseAuditFilters(sp);
  let r;
  try {
    r = await listAudit(await auth(), auditRepo, filters);
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw e;
  }
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          Action
          <select
            name="action"
            defaultValue={filters.action ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            {r.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Actor
          <select
            name="actor"
            defaultValue={filters.actor ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">Anyone</option>
            {r.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
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
        <button className="rounded-md bg-black px-3 py-2 text-white">Filter</button>
        <Link href="/admin/audit" className="px-2 py-2 text-sm underline">
          Clear
        </Link>
        <a
          href={`/api/audit/export?${query(sp)}`}
          download
          className="ml-auto rounded-md border px-3 py-2 text-sm"
        >
          Download CSV
        </a>
      </form>
      <p className="text-sm text-gray-600" data-testid="audit-count">
        {r.total} entr{r.total === 1 ? "y" : "ies"}
      </p>
      {r.rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-gray-600">
          No audit entries match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead>
              <tr className="border-b">
                <th className="p-2">Time</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Action</th>
                <th className="p-2">Entity</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="p-2 whitespace-nowrap">{fmt(row.createdAt)}</td>
                  <td className="p-2">{row.actorName ?? (row.actorId ? row.actorId : "System")}</td>
                  <td className="p-2 font-mono text-xs">{row.action}</td>
                  <td className="p-2">
                    {row.entityType}
                    {row.entityId ? ` ${row.entityId.slice(-8)}` : ""}
                  </td>
                  <td className="p-2">
                    {row.metadata ? (
                      <details>
                        <summary className="cursor-pointer">View</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-4 text-sm">
          {r.page > 1 && (
            <Link
              href={`/admin/audit?${query(sp, { page: String(r.page - 1) })}`}
              className="underline"
            >
              Previous
            </Link>
          )}
          <span>
            Page {r.page} of {r.pages}
          </span>
          {r.page < r.pages && (
            <Link
              href={`/admin/audit?${query(sp, { page: String(r.page + 1) })}`}
              className="underline"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-gray-600">
        Append-only record of who did what. It holds ids, roles and counts, never draft text or
        personal details.
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
