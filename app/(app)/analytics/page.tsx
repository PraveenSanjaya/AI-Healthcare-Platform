import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prismaAnalyticsRepo } from "@/lib/analytics/repo";
import { getAnalytics, parseRange, type Analytics } from "@/lib/analytics/service";
import { AuthError } from "@/lib/auth/guards";
import { AnalyticsCharts } from "./charts";

export const metadata = { title: "Analytics" };

type Search = Record<string, string | string[] | undefined>;

const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const nf = new Intl.NumberFormat("en-US");

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className="mt-1 text-2xl font-semibold"
        data-testid={`tile-${label.toLowerCase().replace(/\W+/g, "-")}`}
      >
        {value}
      </dd>
      {note && <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>}
    </div>
  );
}

function Summary({ a }: { a: Analytics }) {
  const r = a.review;
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Generations" value={nf.format(a.total)} />
        <Tile
          label="PHI blocks"
          value={nf.format(a.phiBlocked)}
          note="Drafts stopped before the AI"
        />
        <Tile
          label="PHI overrides"
          value={nf.format(a.phiOverrides)}
          note="Admin overrides with a reason"
        />
        <Tile
          label="Patient-facing review rate"
          value={r.rate === null ? "n/a" : `${Math.round(r.rate * 100)}%`}
          note={
            r.rate === null ? "No patient-facing drafts" : `${r.reviewed} of ${r.total} reviewed`
          }
        />
        <Tile
          label="Average output length"
          value={a.avgOutputChars === null ? "n/a" : `${nf.format(a.avgOutputChars)} chars`}
        />
        <Tile label="Input tokens" value={nf.format(a.inputTokens)} />
        <Tile label="Output tokens" value={nf.format(a.outputTokens)} />
        <Tile
          label="Estimated cost (estimate)"
          value={usd(a.cost.estimatedUsd)}
          note="From list prices; not a bill"
        />
      </dl>
      {a.cost.byModel.length > 0 && (
        <section className="space-y-2" aria-label="Tokens and estimated cost by model">
          <h2 className="text-lg font-semibold">Tokens and estimated cost by model</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Tokens and estimated cost by model</caption>
              <thead>
                <tr className="border-b">
                  <th className="p-2">Model</th>
                  <th className="p-2">Generations</th>
                  <th className="p-2">Input tokens</th>
                  <th className="p-2">Output tokens</th>
                  <th className="p-2">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {a.cost.byModel.map((m) => (
                  <tr key={m.model} className="border-b">
                    <td className="p-2 font-mono text-xs">{m.model}</td>
                    <td className="p-2">{nf.format(m.generations)}</td>
                    <td className="p-2">{nf.format(m.inputTokens)}</td>
                    <td className="p-2">{nf.format(m.outputTokens)}</td>
                    <td className="p-2">
                      {m.estimatedUsd === null ? "no price" : usd(m.estimatedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            Estimates use the price table in <code>lib/analytics/pricing.ts</code>, which can be out
            of date. Token figures cover first drafts only, not refinements.
            {a.cost.unpricedModels.length > 0 &&
              ` No price is set for: ${a.cost.unpricedModels.join(", ")}.`}
          </p>
        </section>
      )}
    </>
  );
}

async function Analytics({ searchParams }: { searchParams: Promise<Search> }) {
  // The clock makes this page request-time only; say so before reading it.
  await connection();
  const sp = await searchParams;
  const range = parseRange(sp, new Date());
  let a: Analytics;
  try {
    a = await getAnalytics(await auth(), prismaAnalyticsRepo, range);
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw e;
  }
  return (
    <>
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Date range"
      >
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="mt-1 block rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="mt-1 block rounded-md border px-3 py-2"
          />
        </label>
        <button className="bg-primary text-primary-foreground rounded-md px-3 py-2">Apply</button>
        <Link href="/analytics" className="px-2 py-2 text-sm underline">
          Last 30 days
        </Link>
        <p className="text-muted-foreground ml-auto text-sm" data-testid="analytics-range">
          {range.from} to {range.to} ({range.days} day{range.days === 1 ? "" : "s"})
        </p>
      </form>
      {a.total === 0 && a.phiBlocked === 0 && a.phiOverrides === 0 ? (
        <p
          className="text-muted-foreground rounded-lg border p-8 text-center"
          data-testid="analytics-empty"
        >
          No activity in this period. Run a template, or widen the date range.
        </p>
      ) : null}
      <Summary a={a} />
      <AnalyticsCharts perDay={a.perDay} perTemplate={a.perTemplate} perUser={a.perUser} />
    </>
  );
}

export default function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Analytics searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
