import { z } from "zod";

export const VARIABLE_TYPES = ["text", "textarea", "number", "select", "longtext-paste"] as const;

export const variableSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, "variable names are snake_case"),
  label: z.string().min(1),
  type: z.enum(VARIABLE_TYPES),
  required: z.boolean(),
  default: z.string().optional(),
  options: z.array(z.string()).optional(),
  helpText: z.string().optional(),
  fromProfile: z.boolean().optional(),
});

export const templateSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  category: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  audience: z.enum(["INTERNAL", "PATIENT_FACING"]),
  role: z.string().min(1),
  context: z.string().min(1),
  task: z.string().min(1),
  constraints: z.string().min(1),
  outputFormat: z.string().min(1),
  variables: z.array(variableSchema),
  maxWords: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

export type TemplateVariable = z.infer<typeof variableSchema>;
export type TemplateSeed = z.infer<typeof templateSeedSchema>;

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Names of all {{placeholders}} used in the given strings. */
export function placeholdersIn(...texts: string[]): Set<string> {
  const found = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(PLACEHOLDER_RE)) found.add(m[1]);
  return found;
}
