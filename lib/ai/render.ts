import { PLACEHOLDER_RE, placeholdersIn, type TemplateVariable } from "@/lib/templates/types";
import { profileValues, type ClinicProfileData } from "./profile";

/** The parts of a TemplateVersion needed to render it. */
export type RenderableVersion = {
  role: string;
  context: string;
  task: string;
  constraints: string;
  outputFormat: string;
  variables: TemplateVariable[];
  maxWords?: number | null;
  maxChars?: number | null;
};

export type RenderedTemplate = {
  role: string;
  context: string;
  task: string;
  constraints: string;
  outputFormat: string;
  /** The user message: context, task, constraints, length limit and output format. */
  prompt: string;
};

export class RenderError extends Error {
  constructor(
    message: string,
    readonly missing: string[] = [],
    readonly invalid: string[] = [],
  ) {
    super(message);
    this.name = "RenderError";
  }
}

/** Shown in place of an optional variable the user left empty. */
export const NOT_PROVIDED = "(none provided)";

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function resolveValues(
  version: RenderableVersion,
  inputs: Record<string, string | undefined>,
  profile: ClinicProfileData,
): Record<string, string> {
  const fromProfile = profileValues(profile);
  const values: Record<string, string> = {};
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const v of version.variables) {
    const given = (inputs[v.name] ?? "").trim();
    const profileValue = v.fromProfile ? (fromProfile[v.name] ?? "").trim() : "";
    // Precedence: what the user typed, then the clinic-profile value, then the default.
    const value = given || profileValue || (v.default ?? "").trim();

    if (!value) {
      if (v.required) missing.push(`${v.label} (${v.name})`);
      else values[v.name] = NOT_PROVIDED;
      continue;
    }
    if (v.type === "number" && !NUMBER_RE.test(value)) {
      invalid.push(`${v.label} (${v.name}) must be a number`);
      continue;
    }
    if (v.type === "select" && v.options && !v.options.includes(value)) {
      invalid.push(`${v.label} (${v.name}) must be one of: ${v.options.join(", ")}`);
      continue;
    }
    values[v.name] = value;
  }

  if (missing.length || invalid.length) {
    const parts = [
      missing.length && `Missing required variable(s): ${missing.join(", ")}.`,
      invalid.length && `Invalid value(s): ${invalid.join("; ")}.`,
    ].filter(Boolean);
    throw new RenderError(parts.join(" "), missing, invalid);
  }
  return values;
}

/**
 * Fill a template version. Single pass, so a value that itself contains "{{x}}" is
 * never expanded again. Throws RenderError for missing/invalid variables, and for
 * placeholders the template uses but does not declare, so the output can never
 * contain an unfilled template placeholder.
 */
export function renderTemplate(
  version: RenderableVersion,
  inputs: Record<string, string | undefined>,
  profile: ClinicProfileData,
): RenderedTemplate {
  const sections = [
    version.role,
    version.context,
    version.task,
    version.constraints,
    version.outputFormat,
  ];
  const declared = new Set(version.variables.map((v) => v.name));
  const undeclared = [...placeholdersIn(...sections)].filter((n) => !declared.has(n));
  if (undeclared.length) {
    throw new RenderError(`Template uses undeclared variable(s): ${undeclared.join(", ")}.`);
  }

  const values = resolveValues(version, inputs, profile);
  const fill = (text: string) =>
    text.replace(PLACEHOLDER_RE, (_whole, name: string) => values[name]);

  const [role, context, task, constraints, outputFormat] = sections.map(fill);

  const limits = [
    version.maxWords ? `Maximum ${version.maxWords} words.` : "",
    version.maxChars ? `Maximum ${version.maxChars} characters.` : "",
  ].filter(Boolean);

  const prompt = [
    `## Context\n${context}`,
    `## Task\n${task}`,
    `## Constraints\n${constraints}`,
    limits.length ? `## Length limit\n${limits.join(" ")}` : "",
    `## Output format\n${outputFormat}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { role, context, task, constraints, outputFormat, prompt };
}
