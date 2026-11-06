import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadClinicProfile } from "@/lib/ai/repo";
import { AuthError } from "@/lib/auth/guards";
import { prismaAdminTemplateRepo } from "@/lib/templates/admin-repo";
import {
  TemplateAdminNotFoundError,
  getTemplateForEdit,
  type AdminVersion,
} from "@/lib/templates/admin-service";
import { diffVersions } from "@/lib/templates/editor";
import { ArchiveButton } from "../archive-button";
import { TemplateEditor } from "../template-editor";

export const metadata = { title: "Edit template" };

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

function History({ versions }: { versions: AdminVersion[] }) {
  return (
    <section className="space-y-3" aria-label="Version history">
      <h2 className="text-lg font-semibold">Version history</h2>
      <ol className="space-y-2">
        {versions.map((v, i) => {
          const older = versions[i + 1];
          const changes = older ? diffVersions(older.content, v.content) : [];
          return (
            <li key={v.version} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                Version {v.version}
                {i === 0 && " (current)"}
              </p>
              <p className="text-muted-foreground">
                {fmt(v.createdAt)} · {v.createdByName ?? "seed data"}
              </p>
              {older ? (
                changes.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      {changes.length} change{changes.length === 1 ? "" : "s"} from version{" "}
                      {older.version}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {changes.map((c) => (
                        <li key={c.field}>
                          <span className="font-medium">{c.field}</span>
                          <p className="whitespace-pre-wrap text-red-800 dark:text-red-200">
                            - {c.before}
                          </p>
                          <p className="whitespace-pre-wrap text-green-800 dark:text-green-200">
                            + {c.after}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="text-muted-foreground mt-1">No wording changes.</p>
                )
              ) : (
                <p className="text-muted-foreground mt-1">First version.</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

async function Edit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let detail;
  try {
    detail = await getTemplateForEdit(await auth(), prismaAdminTemplateRepo, slug);
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    if (e instanceof TemplateAdminNotFoundError) notFound();
    throw e;
  }
  const [categories, profile] = await Promise.all([
    prismaAdminTemplateRepo.categories(),
    loadClinicProfile(),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{detail.input.title}</h1>
        <span className="bg-muted rounded px-2 py-0.5 text-xs">
          Version {detail.currentVersion}
        </span>
        {detail.archived && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            Archived
          </span>
        )}
        <ArchiveButton slug={detail.slug} archived={detail.archived} />
      </div>
      <TemplateEditor
        slug={detail.slug}
        initial={detail.input}
        categories={categories}
        profile={profile}
      />
      <History versions={detail.versions} />
    </>
  );
}

export default function EditTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 p-6">
      <p className="text-muted-foreground text-sm">
        <Link href="/admin/templates" className="underline">
          Manage templates
        </Link>{" "}
        / Edit
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <Edit params={params} />
      </Suspense>
    </main>
  );
}
