import { templateSeedSchema, type TemplateSeed } from "../templates/types";

export type VersionContent = {
  role: string;
  context: string;
  task: string;
  constraints: string;
  outputFormat: string;
  variables: unknown;
  maxWords: number | null;
  maxChars: number | null;
};

export type TemplateMeta = {
  title: string;
  description: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  categoryId: string;
};

/** Persistence port; prisma/seed.ts provides the Prisma implementation. */
export type SeedDb = {
  upsertCategory(c: { slug: string; name: string; order: number }): Promise<string>;
  findTemplate(slug: string): Promise<{
    id: string;
    latestVersion: number;
    /** `editedByUser`: the current version was saved by a person in the template editor. */
    current: { content: VersionContent; editedByUser?: boolean } | null;
  } | null>;
  createTemplate(slug: string, meta: TemplateMeta): Promise<string>;
  updateTemplate(id: string, meta: TemplateMeta): Promise<void>;
  addVersion(templateId: string, version: number, content: VersionContent): Promise<void>;
};

export type SeedSummary = { created: number; versioned: number; unchanged: number };

export function contentOf(t: TemplateSeed): VersionContent {
  return {
    role: t.role,
    context: t.context,
    task: t.task,
    constraints: t.constraints,
    outputFormat: t.outputFormat,
    variables: t.variables,
    maxWords: t.maxWords ?? null,
    maxChars: t.maxChars ?? null,
  };
}

/** JSON with sorted keys, so Postgres jsonb key reordering cannot look like a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameContent(a: VersionContent, b: VersionContent): boolean {
  return canonical(a) === canonical(b);
}

export async function seedTemplates(
  db: SeedDb,
  categories: readonly { slug: string; name: string; order: number }[],
  templates: readonly TemplateSeed[],
): Promise<SeedSummary> {
  const parsed = templates.map((t) => templateSeedSchema.parse(t));
  const categoryIds = new Map<string, string>();
  for (const c of categories) categoryIds.set(c.slug, await db.upsertCategory(c));

  const summary: SeedSummary = { created: 0, versioned: 0, unchanged: 0 };
  for (const t of parsed) {
    const categoryId = categoryIds.get(t.category);
    if (!categoryId) throw new Error(`Template ${t.slug}: unknown category ${t.category}`);
    const meta: TemplateMeta = {
      title: t.title,
      description: t.description,
      audience: t.audience,
      categoryId,
    };
    const content = contentOf(t);
    const existing = await db.findTemplate(t.slug);
    if (!existing) {
      const id = await db.createTemplate(t.slug, meta);
      await db.addVersion(id, 1, content);
      summary.created++;
      continue;
    }
    // A version saved in the template editor wins: re-seeding must never undo an admin's edit.
    if (existing.current?.editedByUser) {
      summary.unchanged++;
      continue;
    }
    await db.updateTemplate(existing.id, meta);
    if (existing.current && sameContent(existing.current.content, content)) {
      summary.unchanged++;
    } else {
      await db.addVersion(existing.id, existing.latestVersion + 1, content);
      summary.versioned++;
    }
  }
  return summary;
}
