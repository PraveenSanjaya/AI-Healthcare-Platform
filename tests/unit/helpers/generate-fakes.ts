import { TEMPLATES } from "@/prisma/seed-data/templates";
import type { AuditEntry, GenerateDeps, GenerationRecord, GenerationRepo } from "@/lib/ai/generate";
import { DEFAULT_CLINIC_PROFILE } from "@/lib/ai/profile";
import { MockProvider } from "@/lib/ai/providers";
import type { LLMProvider } from "@/lib/ai/providers";
import type { TemplateRepo, TemplateRow } from "@/lib/templates/service";

export function rowFromSeed(slug: string, over: Partial<TemplateRow> = {}): TemplateRow {
  const t = TEMPLATES.find((x) => x.slug === slug)!;
  return {
    id: `tpl-${slug}`,
    slug,
    title: t.title,
    description: t.description,
    audience: t.audience,
    archived: false,
    allowedRoles: ["ADMIN", "MANAGER", "STAFF"],
    category: { slug: t.category, name: t.category, order: 1 },
    current: {
      id: `ver-${slug}`,
      role: t.role,
      context: t.context,
      task: t.task,
      constraints: t.constraints,
      outputFormat: t.outputFormat,
      variables: t.variables,
      maxWords: t.maxWords ?? null,
      maxChars: t.maxChars ?? null,
    },
    ...over,
  };
}

export const session = (role: "ADMIN" | "MANAGER" | "STAFF", id = `u-${role}`) => ({
  user: { id, role },
});

export function makeDeps(
  rows: TemplateRow[],
  over: Partial<GenerateDeps> & { usage?: { count: number; oldest: Date | null } } = {},
) {
  const audit: AuditEntry[] = [];
  const created: Parameters<GenerationRepo["create"]>[0][] = [];
  const templates: TemplateRepo = {
    list: async () => rows,
    findBySlug: async (slug) => rows.find((r) => r.slug === slug) ?? null,
    favoriteTemplateIds: async () => [],
    setFavorite: async () => {},
  };
  const store = new Map<string, GenerationRecord>();
  const refinements: { generationId: string; instruction: string; output: string }[] = [];
  const generations: GenerationRepo = {
    usageSince: async () => over.usage ?? { count: 0, oldest: null },
    create: async (data) => {
      created.push(data);
      const id = `gen-${created.length}`;
      store.set(id, {
        id,
        userId: data.userId,
        templateVersionId: data.templateVersionId,
        inputs: data.inputs,
        renderedPrompt: data.renderedPrompt,
        output: data.output,
        refinements: [],
      });
      return id;
    },
    find: async (id) => {
      const g = store.get(id);
      if (!g) return null;
      return {
        ...g,
        refinements: refinements
          .filter((r) => r.generationId === id)
          .map(({ instruction, output }) => ({ instruction, output })),
      };
    },
    addRefinement: async (generationId, instruction, output) => {
      refinements.push({ generationId, instruction, output });
      return `ref-${refinements.length}`;
    },
  };
  const deps: GenerateDeps = {
    templates,
    generations,
    audit: async (e) => {
      audit.push(e);
    },
    profile: async () => ({
      ...DEFAULT_CLINIC_PROFILE,
      clinicName: "Lakeside Clinic",
      city: "Kandy",
    }),
    provider: new MockProvider(),
    env: {},
    now: () => new Date("2026-11-05T12:00:00Z"),
    ...over,
  };
  return { deps, audit, created, store, refinements };
}

/** Read an NDJSON response body into parsed lines. */
export async function readLines(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; [k: string]: unknown });
}

export const failingProvider: LLMProvider = {
  name: "failing",

  async *streamGenerate() {
    throw new Error("boom with secret prompt text");
  },
};
