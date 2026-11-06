import Link from "next/link";
import { Suspense } from "react";
import Markdown from "react-markdown";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaHistoryRepo } from "@/lib/history/repo";
import { exportAllowed } from "@/lib/export/service";
import { HistoryNotFoundError, getHistoryDetail } from "@/lib/history/service";

export const metadata = { title: "Draft" };

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
const md = "space-y-3 rounded-lg border p-4 [&_li]:ml-5 [&_li]:list-disc";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  let d;
  try {
    d = await getHistoryDetail(session, prismaHistoryRepo, id);
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    if (e instanceof HistoryNotFoundError) notFound();
    throw e;
  }
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/history" className="underline">
            History
          </Link>{" "}
          / {d.templateTitle}
        </p>
        <h1 className="text-2xl font-semibold">{d.templateTitle}</h1>
        <p className="text-muted-foreground text-sm">
          {d.userName} · {fmt(d.createdAt)} · template version {d.templateVersion} · {d.model} ·{" "}
          {d.reviewed && d.reviewedAt ? `Reviewed ${fmt(d.reviewedAt)}` : "Not reviewed"}
        </p>
        {d.isOwner && (
          <p>
            <Link
              href={`/templates/${d.templateSlug}?reopen=${d.id}`}
              className="bg-primary text-primary-foreground inline-block rounded-md px-3 py-2"
            >
              Reopen in the runner
            </Link>
          </p>
        )}
      </header>

      <section className="flex flex-wrap items-center gap-2 text-sm" aria-label="Export">
        <span className="font-medium">Export latest text</span>
        {exportAllowed(d) ? (
          (["md", "docx", "pdf"] as const).map((f) => (
            <a
              key={f}
              href={`/api/export/${d.id}?format=${f}`}
              download
              className="rounded-md border px-3 py-1.5"
            >
              .{f}
            </a>
          ))
        ) : (
          <span className="text-muted-foreground">
            Patient-facing drafts can be exported after the author has reviewed them.
          </span>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          Inputs
        </h2>
        <dl className="divide-y rounded-lg border text-sm">
          {Object.entries(d.inputs).map(([k, v]) => (
            <div key={k} className="p-3">
              <dt className="font-medium">{k}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          First draft
        </h2>
        <p className="inline-block rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          AI draft — review before use
        </p>
        <div className={md}>
          <Markdown>{d.output}</Markdown>
        </div>
      </section>

      {d.refinements.map((r, i) => (
        <section key={r.id} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            Refinement {i + 1}: {r.instruction}
          </h2>
          <p className="text-muted-foreground text-xs">{fmt(r.createdAt)}</p>
          <div className={md}>
            <Markdown>{r.output}</Markdown>
          </div>
        </section>
      ))}
    </article>
  );
}

export default function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}
