"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaTemplateRepo } from "@/lib/templates/repo";
import { TemplateNotFoundError, setFavorite } from "@/lib/templates/service";

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
