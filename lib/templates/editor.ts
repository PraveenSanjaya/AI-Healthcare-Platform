import { z } from "zod";
import { profileValues, DEFAULT_CLINIC_PROFILE } from "@/lib/ai/profile";
import { ROLES } from "@/lib/auth/roles";
import { placeholdersIn, variableSchema, type TemplateVariable } from "./types";

/** Everything an admin edits for one template. `slug` is fixed once created. */
export const templateInputSchema = z.object({
  categorySlug: z.string().min(1, "Choose a category").max(100),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().min(1, "Description is required").max(500),
  audience: z.enum(["INTERNAL", "PATIENT_FACING"]),
  allowedRoles: z.array(z.enum(ROLES)).max(3),
  role: z.string().trim().min(1, "Role is required").max(2000),
  context: z.string().trim().min(1, "Context is required").max(8000),
  task: z.string().trim().min(1, "Task is required").max(8000),
  constraints: z.string().trim().min(1, "Constraints are required").max(8000),
  outputFormat: z.string().trim().min(1, "Output format is required").max(4000),
  variables: z.array(variableSchema).max(30, "At most 30 variables"),
  maxWords: z.number().int().positive().max(100_000).nullable(),
  maxChars: z.number().int().positive().max(1_000_000).nullable(),
});

export type TemplateInput = z.infer<typeof templateInputSchema>;

export const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug is required")
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const PROFILE_KEYS = new Set(Object.keys(profileValues(DEFAULT_CLINIC_PROFILE)));

/**
 * Problems the schema cannot express: placeholders vs variables, duplicate names, options,
 * profile-backed variables. Returned as messages, never thrown, so the editor can list them live.
 */
export function validateTemplateContent(
  t: Pick<
    TemplateInput,
    "role" | "context" | "task" | "constraints" | "outputFormat" | "variables"
  >,
): string[] {
  const issues: string[] = [];
  const used = placeholdersIn(t.role, t.context, t.task, t.constraints, t.outputFormat);
  const names = t.variables.map((v) => v.name);
  const declared = new Set(names);

  for (const n of used) {
    if (!declared.has(n)) issues.push(`{{${n}}} is used in the template but has no variable.`);
  }
  for (const n of declared) {
    if (!used.has(n)) issues.push(`Variable "${n}" is never used as {{${n}}} in the template.`);
  }
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) issues.push(`Variable name "${n}" appears more than once.`);
    seen.add(n);
  }
  for (const v of t.variables) {
    if (v.type === "select") {
      if (!v.options?.length)
        issues.push(`"${v.name}" is a select, so it needs at least one option.`);
      else if (v.default && !v.options.includes(v.default))
        issues.push(`The default of "${v.name}" must be one of its options.`);
    }
    if (v.type === "number" && v.default && !/^-?\d+(\.\d+)?$/.test(v.default)) {
      issues.push(`The default of "${v.name}" must be a number.`);
    }
    if (v.fromProfile && !PROFILE_KEYS.has(v.name)) {
      issues.push(
        `"${v.name}" cannot be filled from the clinic profile. Allowed: ${[...PROFILE_KEYS].join(", ")}.`,
      );
    }
  }
  return issues;
}

export type TemplateContent = Pick<
  TemplateInput,
  | "role"
  | "context"
  | "task"
  | "constraints"
  | "outputFormat"
  | "variables"
  | "maxWords"
  | "maxChars"
>;

export type FieldChange = { field: string; before: string; after: string };

const describeVar = (v: TemplateVariable) =>
  [
    v.type,
    v.required ? "required" : "optional",
    v.fromProfile ? "from profile" : "",
    v.default ? `default "${v.default}"` : "",
    v.options?.length ? `options ${v.options.join("/")}` : "",
    v.helpText ? `help "${v.helpText}"` : "",
    `label "${v.label}"`,
  ]
    .filter(Boolean)
    .join(", ");

/** A simple field-by-field diff between two versions' content. */
export function diffVersions(prev: TemplateContent, next: TemplateContent): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of ["role", "context", "task", "constraints", "outputFormat"] as const) {
    if (prev[f] !== next[f]) out.push({ field: f, before: prev[f], after: next[f] });
  }
  for (const f of ["maxWords", "maxChars"] as const) {
    if ((prev[f] ?? null) !== (next[f] ?? null)) {
      out.push({ field: f, before: String(prev[f] ?? "none"), after: String(next[f] ?? "none") });
    }
  }
  const before = new Map(prev.variables.map((v) => [v.name, describeVar(v)]));
  const after = new Map(next.variables.map((v) => [v.name, describeVar(v)]));
  for (const [name, desc] of before) {
    if (!after.has(name)) out.push({ field: `variable ${name}`, before: desc, after: "(removed)" });
    else if (after.get(name) !== desc)
      out.push({ field: `variable ${name}`, before: desc, after: after.get(name)! });
  }
  for (const [name, desc] of after) {
    if (!before.has(name))
      out.push({ field: `variable ${name}`, before: "(not present)", after: desc });
  }
  return out;
}

/** Sample values for the live preview: defaults where they exist, readable stand-ins otherwise. */
export function sampleInputs(variables: TemplateVariable[]): Record<string, string> {
  return Object.fromEntries(
    variables.map((v) => {
      let value = v.default ?? "";
      if (!value) {
        if (v.type === "number") value = "5";
        else if (v.type === "select") value = v.options?.[0] ?? "";
        else value = `[${v.label}]`;
      }
      return [v.name, value];
    }),
  );
}

/** Field names whose values differ, for audit metadata. */
export function changedFields(
  prev: TemplateContent &
    Pick<TemplateInput, "title" | "description" | "audience" | "allowedRoles" | "categorySlug">,
  next: TemplateContent &
    Pick<TemplateInput, "title" | "description" | "audience" | "allowedRoles" | "categorySlug">,
): string[] {
  const keys = [
    "title",
    "description",
    "audience",
    "categorySlug",
    "role",
    "context",
    "task",
    "constraints",
    "outputFormat",
    "maxWords",
    "maxChars",
  ] as const;
  const out: string[] = keys.filter((k) => (prev[k] ?? null) !== (next[k] ?? null));
  if ([...prev.allowedRoles].sort().join() !== [...next.allowedRoles].sort().join())
    out.push("allowedRoles");
  if (diffVersions(prev, next).some((c) => c.field.startsWith("variable"))) out.push("variables");
  return out;
}
