import { z } from "zod";
import type { TemplateVariable } from "@/lib/templates/types";
import { profileValues, type ClinicProfileData } from "../profile";

export type FormValues = Record<string, string>;

/**
 * Starting values: the clinic-profile value for `fromProfile` variables, otherwise the
 * template default. Matches the server's precedence (typed input, profile, default).
 */
export function defaultValues(variables: TemplateVariable[], profile: ClinicProfileData) {
  const fromProfile = profileValues(profile);
  return Object.fromEntries(
    variables.map((v) => [
      v.name,
      (v.fromProfile ? fromProfile[v.name]?.trim() : "") || v.default || "",
    ]),
  ) as FormValues;
}

/** Zod schema for the runner form, built from the template's variable list. */
export function buildFormSchema(variables: TemplateVariable[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const v of variables) {
    let field: z.ZodType<string> = z.string().trim().max(50_000, "Too long");
    if (v.type === "number") {
      field = z
        .string()
        .trim()
        .regex(/^(-?\d+(\.\d+)?)?$/, "Enter a number");
    } else if (v.type === "select" && v.options?.length) {
      const options = v.options;
      field = z
        .string()
        .trim()
        .refine((s) => s === "" || options.includes(s), "Choose one of the options");
    }
    if (v.required) {
      field = field.refine((s) => s.trim().length > 0, `${v.label} is required`);
    }
    shape[v.name] = field;
  }
  return z.object(shape);
}
