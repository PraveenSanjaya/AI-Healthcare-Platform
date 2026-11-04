import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaTemplateRepo } from "@/lib/templates/repo";
import {
  applyFilters,
  groupByCategory,
  listTemplates,
  type LibraryItem,
} from "@/lib/templates/service";
import { FavoriteButton } from "./favorite-button";

export const metadata = { title: "Templates" };

type Search = { q?: string; category?: string; audience?: string; fav?: string };

function TemplateCard({ t }: { t: LibraryItem }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">
          <Link href={`/templates/${t.slug}`} className="underline-offset-2 hover:underline">
            {t.title}
          </Link>
        </h3>
        {t.audience === "PATIENT_FACING" && (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-900">
            Patient-facing
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600">{t.category.name}</p>
      <p className="text-sm">{t.description}</p>
      {t.current && <p className="text-xs text-gray-600">Act as {t.current.role}</p>}
      <div className="mt-auto pt-2">
        <FavoriteButton slug={t.slug} favorite={t.favorite} />
      </div>
    </li>
  );
}

async function Library({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await auth();
  let items: LibraryItem[];
  try {
    items = await listTemplates(session, prismaTemplateRepo);
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }
  const categories = groupByCategory(items).map((g) => ({ slug: g.slug, name: g.name }));
  const audience =
    sp.audience === "INTERNAL" || sp.audience === "PATIENT_FACING" ? sp.audience : undefined;
  const filtered = applyFilters(items, {
    q: sp.q,
    category: sp.category,
    audience,
    favoritesOnly: sp.fav === "1",
  });
  const groups = groupByCategory(filtered);
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm">
          Search
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Category
          <select
            name="category"
            defaultValue={sp.category ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Audience
          <select
            name="audience"
            defaultValue={audience ?? ""}
            className="mt-1 block rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            <option value="INTERNAL">Internal</option>
            <option value="PATIENT_FACING">Patient-facing</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="fav" value="1" defaultChecked={sp.fav === "1"} />
          Favorites only
        </label>
        <button className="rounded-md bg-black px-3 py-2 text-white">Apply</button>
        <Link href="/templates" className="pb-2 text-sm underline">
          Reset
        </Link>
      </form>
      <p className="text-sm text-gray-600" aria-live="polite">
        {filtered.length} template{filtered.length === 1 ? "" : "s"}
      </p>
      {groups.length === 0 && <p>No templates match.</p>}
      {groups.map((g) => (
        <section key={g.slug} aria-labelledby={`cat-${g.slug}`} className="space-y-3">
          <h2 id={`cat-${g.slug}`} className="text-lg font-semibold">
            {g.name}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((t) => (
              <TemplateCard key={t.id} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default function TemplatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Template library</h1>
      <Suspense fallback={<p>Loading templates…</p>}>
        <Library searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
