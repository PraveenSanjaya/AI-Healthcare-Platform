"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaUserRepo } from "@/lib/users/repo";
import { UserError, changeRole, createUser, setUserActive } from "@/lib/users/service";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: e.code === "FORBIDDEN" ? "Forbidden" : "Not signed in" };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function createUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => createUser(await auth(), prismaUserRepo, Object.fromEntries(formData)));
}

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  return run(async () => changeRole(await auth(), prismaUserRepo, userId, role));
}

export async function setActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return run(async () => setUserActive(await auth(), prismaUserRepo, userId, active));
}
