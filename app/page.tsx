import { ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16"
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Non-clinical assistant for medical centres
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">ClinicAssist</h1>
      <p className="text-muted-foreground text-lg">
        A library of vetted AI prompt templates for front-desk, management and marketing staff.
        Sign-in and the template library arrive in the next build phases.
      </p>
      <p className="rounded-md border p-4 text-sm">
        ClinicAssist never diagnoses or gives treatment advice, and must only be used with
        anonymized text. Every output is an AI draft that staff review before use.
      </p>
    </main>
  );
}
