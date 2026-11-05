"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { writeAudit } from "@/lib/ai/repo";
import { AuthError } from "@/lib/auth/guards";
import { prismaAdminTemplateRepo } from "@/lib/templates/admin-repo";
import {
  TemplateAdminNotFoundError,
  createTemplate,
  saveTemplate,
  setTemplateArchived,
  type SaveResult,
} from "@/lib/templates/admin-service";

const deps = { repo: prismaAdminTemplateRepo, audit: writeAudit };

function failure(e: unknown): SaveResult {
  if (e instanceof AuthError) {
    return { ok: false, errors: [e.code === "FORBIDDEN" ? "Forbidden" : "Not signed in"] };
  }
  if (e instanceof TemplateAdminNotFoundError) return { ok: false, errors: ["Template not found"] };
  throw e;
}

function refresh(slug: string) {
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${slug}`);
  revalidatePath("/templates", "layout");
}

/** Create (when `existingSlug` is null) or save a template. Saving new wording makes a new version. */
export async function saveTemplateAction(
  existingSlug: string | null,
  newSlug: string,
  payload: unknown,
): Promise<SaveResult> {
  try {
    const session = await auth();
    const r = existingSlug
      ? await saveTemplate(session, deps, existingSlug, payload)
      : await createTemplate(session, deps, newSlug, payload);
    if (r.ok) refresh(r.slug);
    return r;
  } catch (e) {
    return failure(e);
  }
}

export async function archiveTemplateAction(
  slug: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await setTemplateArchived(await auth(), deps, String(slug), Boolean(archived));
    refresh(slug);
    return { ok: true };
  } catch (e) {
    const f = failure(e);
    return { ok: false, error: f.ok ? undefined : f.errors[0] };
  }
}
