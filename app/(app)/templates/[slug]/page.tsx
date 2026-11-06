import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadClinicProfile } from "@/lib/ai/repo";
import { prismaHistoryRepo } from "@/lib/history/repo";
import { getHistoryDetail, latestDraft } from "@/lib/history/service";
import { AuthError } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/roles";
import { prismaTemplateRepo } from "@/lib/templates/repo";
import { TemplateNotFoundError, getTemplate } from "@/lib/templates/service";
import { variableSchema } from "@/lib/templates/types";
import { z } from "zod";
import { FavoriteButton } from "../favorite-button";
import { Runner } from "./runner";

const variablesSchema = z.array(variableSchema);

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <p className="whitespace-pre-wrap">{children}</p>
    </section>
  );
}

type Search = Record<string, string | string[] | undefined>;

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const reopenId = Array.isArray(sp.reopen) ? sp.reopen[0] : sp.reopen;
  const session = await auth();
  let t;
  try {
    t = await getTemplate(session, prismaTemplateRepo, slug);
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    if (e instanceof TemplateNotFoundError) notFound();
    throw e;
  }
  const v = t.current;
  const vars = variablesSchema.safeParse(v?.variables).data ?? [];
  const profile = await loadClinicProfile();
  const initial = reopenId ? await loadReopen(session, reopenId, t.slug) : undefined;
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/templates" className="underline">
            Templates
          </Link>{" "}
          / {t.category.name}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          {t.audience === "PATIENT_FACING" && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-900 dark:bg-blue-900 dark:text-blue-100">
              Patient-facing
            </span>
          )}
        </div>
        <p>{t.description}</p>
        <FavoriteButton slug={t.slug} favorite={t.favorite} />
      </header>
      {v ? (
        <>
          <Block title="Act as">{v.role}</Block>
          <Block title="Context">{v.context}</Block>
          <Block title="Task">{v.task}</Block>
          <Block title="Constraints">{v.constraints}</Block>
          <Block title="Output format">{v.outputFormat}</Block>
          {(v.maxWords || v.maxChars) && (
            <p className="text-sm">
              Limit:{" "}
              {[v.maxWords && `${v.maxWords} words`, v.maxChars && `${v.maxChars} characters`]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Variables
            </h2>
            <ul className="divide-y rounded-lg border text-sm">
              {vars.map((x) => (
                <li key={x.name} className="p-3">
                  <code>{`{{${x.name}}}`}</code> — {x.label} ({x.type}
                  {x.required ? ", required" : ""}
                  {x.fromProfile ? ", from clinic profile" : ""}
                  {x.default ? `, default: ${x.default}` : ""}
                  {x.options ? `, options: ${x.options.join(" / ")}` : ""})
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p>This template has no published version yet.</p>
      )}
      {v && (
        <Runner
          slug={t.slug}
          title={t.title}
          audience={t.audience}
          version={{
            role: v.role,
            context: v.context,
            task: v.task,
            constraints: v.constraints,
            outputFormat: v.outputFormat,
            variables: vars,
            maxWords: v.maxWords,
            maxChars: v.maxChars,
          }}
          profile={profile}
          isAdmin={hasRole(session?.user?.role, "ADMIN")}
          initial={initial}
        />
      )}
    </article>
  );
}

/** Your own saved draft for this template, or undefined (never someone else's). */
async function loadReopen(
  session: Parameters<typeof getHistoryDetail>[0],
  id: string,
  slug: string,
) {
  try {
    const d = await getHistoryDetail(session, prismaHistoryRepo, id);
    if (!d.isOwner || d.templateSlug !== slug) return undefined;
    return {
      generationId: d.id,
      inputs: d.inputs,
      draft: latestDraft(d),
      refinements: d.refinements.map((r) => r.instruction),
      reviewed: d.reviewed,
    };
  } catch {
    return undefined;
  }
}

export default function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
