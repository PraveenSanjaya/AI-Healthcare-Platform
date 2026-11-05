import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { prismaSettingsRepo } from "@/lib/settings/repo";
import { getSettings } from "@/lib/settings/service";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Clinic settings" };

async function Settings() {
  let data;
  try {
    data = await getSettings(await auth(), prismaSettingsRepo);
  } catch (e) {
    if (e instanceof AuthError) redirect(e.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw e;
  }
  return (
    <>
      <p className="text-sm text-gray-600">
        These details are filled into templates and the system prompt for every draft.
        {data.canEditAll
          ? ""
          : " You can edit the clinic details; the privacy regime and emergency number are changed by an administrator."}
      </p>
      <SettingsForm initial={data.settings} canEditAll={data.canEditAll} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Clinic settings</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}
