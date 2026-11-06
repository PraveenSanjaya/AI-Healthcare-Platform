import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadClinicProfile } from "@/lib/ai/repo";
import { AuthError, requireRole } from "@/lib/auth/guards";
import { prismaAdminTemplateRepo } from "@/lib/templates/admin-repo";
import type { TemplateInput } from "@/lib/templates/editor";
import { TemplateEditor } from "../template-editor";

export const metadata = { title: "New template" };

const BLANK: TemplateInput = {
  categorySlug: "",
  title: "",
  description: "",
  audience: "INTERNAL",
  allowedRoles: ["ADMIN", "MANAGER", "STAFF"],
  role: "",
  context: "",
  task: "",
  constraints: "",
  outputFormat: "",
  variables: [],
  maxWords: null,
  maxChars: null,
};

async function New() {
  try {
    requireRole(await auth(), "ADMIN");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw e;
  }
  const [categories, profile] = await Promise.all([
    prismaAdminTemplateRepo.categories(),
    loadClinicProfile(),
  ]);
  return <TemplateEditor slug={null} initial={BLANK} categories={categories} profile={profile} />;
}

export default function NewTemplatePage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-4 p-6">
      <p className="text-muted-foreground text-sm">
        <Link href="/admin/templates" className="underline">
          Manage templates
        </Link>{" "}
        / New
      </p>
      <h1 className="text-2xl font-semibold">New template</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <New />
      </Suspense>
    </main>
  );
}
