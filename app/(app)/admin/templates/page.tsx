import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaAdminTemplateRepo } from "@/lib/templates/admin-repo";
import { listAllTemplates, type AdminTemplateRow } from "@/lib/templates/admin-service";
import { ArchiveButton } from "./archive-button";

export const metadata = { title: "Manage templates" };

function Table({ title, rows }: { title: string; rows: AdminTemplateRow[] }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-lg font-semibold">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-gray-600">None.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b">
                <th className="p-2">Title</th>
                <th className="p-2">Category</th>
                <th className="p-2">Audience</th>
                <th className="p-2">Version</th>
                <th className="p-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="p-2">{t.title}</td>
                  <td className="p-2">{t.categoryName}</td>
                  <td className="p-2">
                    {t.audience === "PATIENT_FACING" ? "Patient-facing" : "Internal"}
                  </td>
                  <td className="p-2">v{t.currentVersion ?? "-"}</td>
                  <td className="space-x-2 p-2 whitespace-nowrap">
                    <Link href={`/admin/templates/${t.slug}`} className="underline">
                      Edit
                    </Link>
                    <ArchiveButton slug={t.slug} archived={t.archived} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function List() {
  let rows: AdminTemplateRow[];
  try {
    rows = await listAllTemplates(await auth(), prismaAdminTemplateRepo);
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw e;
  }
  return (
    <>
      <Table title="Active" rows={rows.filter((r) => !r.archived)} />
      <Table title="Archived" rows={rows.filter((r) => r.archived)} />
    </>
  );
}

export default function AdminTemplatesPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage templates</h1>
        <Link href="/admin/templates/new" className="rounded-md bg-black px-3 py-2 text-white">
          New template
        </Link>
      </div>
      <Suspense fallback={<p>Loading…</p>}>
        <List />
      </Suspense>
    </main>
  );
}
