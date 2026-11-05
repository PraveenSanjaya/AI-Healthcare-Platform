"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { writeAudit } from "@/lib/ai/repo";
import { AuthError } from "@/lib/auth/guards";
import { prismaSettingsRepo } from "@/lib/settings/repo";
import { updateSettings, type SettingsResult } from "@/lib/settings/service";

export type SettingsActionState = SettingsResult | { ok: false; errors: { form: string } } | null;

export async function saveSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const r = await updateSettings(
      await auth(),
      { repo: prismaSettingsRepo, audit: writeAudit },
      Object.fromEntries(formData),
    );
    if (r.ok) {
      revalidatePath("/admin/settings");
      revalidatePath("/templates", "layout");
    }
    return r;
  } catch (e) {
    if (e instanceof AuthError) {
      return {
        ok: false,
        errors: { form: e.code === "FORBIDDEN" ? "Forbidden" : "Not signed in" },
      };
    }
    throw e;
  }
}
