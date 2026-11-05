"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaTemplateRepo } from "@/lib/templates/repo";
import { TemplateNotFoundError, setFavorite } from "@/lib/templates/service";
import { prismaGenerationRepo, writeAudit } from "@/lib/ai/repo";
import { reviewGeneration } from "@/lib/ai/review";

export type FavoriteResult = { ok: true } | { ok: false; error: string };

export async function setFavoriteAction(slug: string, on: boolean): Promise<FavoriteResult> {
  try {
    await setFavorite(await auth(), prismaTemplateRepo, slug, on);
    revalidatePath("/templates");
    revalidatePath(`/templates/${slug}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "Not signed in" };
    if (e instanceof TemplateNotFoundError) return { ok: false, error: "Template not found" };
    throw e;
  }
}

export type ReviewActionResult = { ok: true; reviewedAt: string } | { ok: false; error: string };

/** Tick "I have reviewed this" on the caller's own generation. */
export async function reviewGenerationAction(generationId: string): Promise<ReviewActionResult> {
  const r = await reviewGeneration(
    { generations: prismaGenerationRepo, audit: writeAudit, now: () => new Date() },
    await auth(),
    String(generationId),
  );
  if (r.ok) return r;
  return { ok: false, error: r.error === "UNAUTHENTICATED" ? "Not signed in" : "Draft not found" };
}
