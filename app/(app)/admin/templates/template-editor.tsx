"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClinicProfileData } from "@/lib/ai/profile";
import { RenderError, renderTemplate } from "@/lib/ai/render";
import { ROLES } from "@/lib/auth/roles";
import {
  sampleInputs,
  slugify,
  templateInputSchema,
  validateTemplateContent,
  type TemplateInput,
} from "@/lib/templates/editor";
import { VARIABLE_TYPES, type TemplateVariable } from "@/lib/templates/types";
import { saveTemplateAction } from "./actions";

type Row = TemplateVariable & { optionsText: string };

const box = "mt-1 w-full rounded-md border px-3 py-2 font-normal";
const toRow = (v: TemplateVariable): Row => ({ ...v, optionsText: (v.options ?? []).join("\n") });
const cleanRow = ({ optionsText, ...v }: Row): TemplateVariable => {
  const options = optionsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ...v,
    default: v.default?.trim() || undefined,
    helpText: v.helpText?.trim() || undefined,
    options: v.type === "select" ? options : undefined,
    fromProfile: v.fromProfile || undefined,
  };
};
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function TemplateEditor({
  slug,
  initial,
  categories,
  profile,
}: {
  /** null when creating a new template. */
  slug: string | null;
  initial: TemplateInput;
  categories: { slug: string; name: string }[];
  profile: ClinicProfileData;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newSlug, setNewSlug] = useState(slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [f, setF] = useState(initial);
  const [rows, setRows] = useState<Row[]>(initial.variables.map(toRow));
  const [maxWords, setMaxWords] = useState(initial.maxWords?.toString() ?? "");
  const [maxChars, setMaxChars] = useState(initial.maxChars?.toString() ?? "");
  const [result, setResult] = useState<{ ok: boolean; messages: string[] } | null>(null);

  const set = <K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const payload: TemplateInput = useMemo(
    () => ({
      ...f,
      variables: rows.map(cleanRow),
      maxWords: numOrNull(maxWords),
      maxChars: numOrNull(maxChars),
    }),
    [f, rows, maxWords, maxChars],
  );

  const issues = useMemo(() => {
    const parsed = templateInputSchema.safeParse(payload);
    if (!parsed.success) {
      return parsed.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`);
    }
    return validateTemplateContent(parsed.data);
  }, [payload]);

  const preview = useMemo(() => {
    try {
      return {
        ok: true as const,
        text: renderTemplate(payload, sampleInputs(payload.variables), profile).prompt,
      };
    } catch (e) {
      return {
        ok: false as const,
        text: e instanceof RenderError ? e.message : "Preview unavailable.",
      };
    }
  }, [payload, profile]);

  function save() {
    setResult(null);
    start(async () => {
      const r = await saveTemplateAction(slug, newSlug, payload);
      if (!r.ok) return setResult({ ok: false, messages: r.errors });
      const msg = r.version
        ? [`Saved as version ${r.version}. Earlier drafts keep the version they used.`]
        : r.changed.length
          ? [`Saved (${r.changed.join(", ")}). No new version, because the wording did not change.`]
          : ["No changes to save."];
      setResult({ ok: true, messages: msg });
      if (!slug) router.push(`/admin/templates/${r.slug}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        {!slug && (
          <label className="block text-sm font-medium">
            Slug (the web address; cannot be changed later)
            <input
              className={box}
              value={newSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setNewSlug(e.target.value);
              }}
            />
          </label>
        )}
        <label className="block text-sm font-medium">
          Title
          <input
            className={box}
            value={f.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slug && !slugTouched) setNewSlug(slugify(e.target.value));
            }}
          />
        </label>
        <label className="block text-sm font-medium">
          Description
          <input
            className={box}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Category
            <select
              className={box}
              value={f.categorySlug}
              onChange={(e) => set("categorySlug", e.target.value)}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Audience
            <select
              className={box}
              value={f.audience}
              onChange={(e) => set("audience", e.target.value as TemplateInput["audience"])}
            >
              <option value="INTERNAL">Internal</option>
              <option value="PATIENT_FACING">
                Patient-facing (needs review before copy/export)
              </option>
            </select>
          </label>
        </div>
        <fieldset className="text-sm">
          <legend className="font-medium">Roles that can run it</legend>
          <p className="text-muted-foreground">
            Managers and admins can always run every template.
          </p>
          <div className="mt-1 flex gap-4">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={f.allowedRoles.includes(r)}
                  onChange={(e) =>
                    set(
                      "allowedRoles",
                      e.target.checked
                        ? [...f.allowedRoles, r]
                        : f.allowedRoles.filter((x) => x !== r),
                    )
                  }
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        {(
          [
            ["role", "Act as (role)", 2],
            ["context", "Context", 3],
            ["task", "Task", 4],
            ["constraints", "Constraints", 3],
            ["outputFormat", "Output format", 2],
          ] as const
        ).map(([k, label, rowsN]) => (
          <label key={k} className="block text-sm font-medium">
            {label}
            <textarea
              className={box}
              rows={rowsN}
              value={f[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}
        <p className="text-muted-foreground text-sm">
          Use {"{{variable_name}}"} in the text above. Every placeholder needs a variable below, and
          every variable must be used.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Max words (optional)
            <input
              className={box}
              inputMode="numeric"
              value={maxWords}
              onChange={(e) => setMaxWords(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Max characters (optional)
            <input
              className={box}
              inputMode="numeric"
              value={maxChars}
              onChange={(e) => setMaxChars(e.target.value)}
            />
          </label>
        </div>

        <section className="space-y-3" aria-label="Variables">
          <h2 className="text-lg font-semibold">Variables</h2>
          {rows.map((r, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border p-3"
              role="group"
              aria-label={`Variable ${i + 1}`}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Name (snake_case)
                  <input
                    className={box}
                    value={r.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Label
                  <input
                    className={box}
                    value={r.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Type
                  <select
                    className={box}
                    value={r.type}
                    onChange={(e) => setRow(i, { type: e.target.value as Row["type"] })}
                  >
                    {VARIABLE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Default (optional)
                  <input
                    className={box}
                    value={r.default ?? ""}
                    onChange={(e) => setRow(i, { default: e.target.value })}
                  />
                </label>
              </div>
              {r.type === "select" && (
                <label className="block text-sm font-medium">
                  Options (one per line)
                  <textarea
                    className={box}
                    rows={3}
                    value={r.optionsText}
                    onChange={(e) => setRow(i, { optionsText: e.target.value })}
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Help text (optional)
                <input
                  className={box}
                  value={r.helpText ?? ""}
                  onChange={(e) => setRow(i, { helpText: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={r.required}
                    onChange={(e) => setRow(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(r.fromProfile)}
                    onChange={(e) => setRow(i, { fromProfile: e.target.checked })}
                  />
                  Fill from clinic profile
                </label>
                <button
                  type="button"
                  className="ml-auto rounded-md border px-2 py-1"
                  onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() =>
              setRows((p) => [
                ...p,
                { name: "", label: "", type: "text", required: true, optionsText: "" },
              ])
            }
          >
            Add variable
          </button>
        </section>

        {issues.length > 0 && (
          <div
            role="status"
            className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            <p className="font-medium">Fix before saving:</p>
            <ul className="ml-5 list-disc">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {result && (
          <div
            role={result.ok ? "status" : "alert"}
            className={`rounded-md border p-3 text-sm ${result.ok ? "border-green-400 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100" : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"}`}
          >
            <ul>
              {result.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="submit"
          disabled={pending || issues.length > 0}
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : slug ? "Save changes" : "Create template"}
        </button>
      </form>

      <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start" aria-label="Live preview">
        <h2 className="text-lg font-semibold">Live preview</h2>
        <p className="text-muted-foreground text-sm">
          The message the model would get, using sample values and your clinic profile.
        </p>
        <pre
          data-testid="template-preview"
          className={`max-h-[70vh] overflow-auto rounded-lg border p-3 text-sm whitespace-pre-wrap ${preview.ok ? "" : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"}`}
        >
          {preview.text}
        </pre>
      </aside>
    </div>
  );
}
