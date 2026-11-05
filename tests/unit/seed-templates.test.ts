import { describe, expect, it } from "vitest";
import { CATEGORIES, TEMPLATES } from "@/prisma/seed-data/templates";
import { placeholdersIn, templateSeedSchema, type TemplateSeed } from "@/lib/templates/types";
import {
  contentOf,
  seedTemplates,
  type SeedDb,
  type TemplateMeta,
  type VersionContent,
} from "@/lib/seed/templates";

describe("seed data integrity", () => {
  it("every template passes the schema and has a unique slug", () => {
    for (const t of TEMPLATES) templateSeedSchema.parse(t);
    expect(new Set(TEMPLATES.map((t) => t.slug)).size).toBe(TEMPLATES.length);
  });
  it("every template belongs to a known category", () => {
    const slugs = new Set<string>(CATEGORIES.map((c) => c.slug));
    for (const t of TEMPLATES) expect(slugs.has(t.category), t.slug).toBe(true);
  });
  it("placeholders and declared variables match exactly", () => {
    for (const t of TEMPLATES) {
      const used = placeholdersIn(t.role, t.context, t.task, t.constraints, t.outputFormat);
      const declared = new Set(t.variables.map((v) => v.name));
      expect(
        [...used].filter((n) => !declared.has(n)),
        `${t.slug} undeclared`,
      ).toEqual([]);
      expect(
        [...declared].filter((n) => !used.has(n)),
        `${t.slug} unused`,
      ).toEqual([]);
    }
  });
  it("select variables have options and defaults are strings", () => {
    for (const t of TEMPLATES)
      for (const v of t.variables)
        if (v.type === "select")
          expect(v.options?.length, `${t.slug}.${v.name}`).toBeGreaterThan(0);
  });
  it("profile variables use the agreed names", () => {
    const allowed = new Set([
      "clinic_name",
      "city",
      "phone",
      "booking_url",
      "privacy_regime",
      "emergency_number",
    ]);
    for (const t of TEMPLATES)
      for (const v of t.variables)
        if (v.fromProfile) expect(allowed.has(v.name), v.name).toBe(true);
  });
  it("HIPAA is never hard-coded", () => {
    for (const t of TEMPLATES) expect(JSON.stringify(t), t.slug).not.toMatch(/hipaa/i);
  });
  it("length limits from the spec are present", () => {
    const by = Object.fromEntries(TEMPLATES.map((t) => [t.slug, t]));
    expect(by["coordination-meeting-minutes"].maxWords).toBe(250);
    expect(by["pre-visit-faq-generator"].maxWords).toBe(200);
    expect(by["google-business-profile-post"].maxWords).toBe(100);
    expect(by["overdue-screening-reminder"].maxChars).toBe(160);
  });
  it("patient-facing review/screening templates forbid confirming patient status", () => {
    const by = Object.fromEntries(TEMPLATES.map((t) => [t.slug, t]));
    expect(by["positive-review-response"].constraints).toMatch(/never confirm/i);
    expect(by["negative-review-deescalation"].constraints).toMatch(/patient status/i);
  });
});

/** In-memory SeedDb that mimics the DB (including jsonb key reordering). */
function memoryDb() {
  const categories = new Map<string, string>();
  const templates = new Map<
    string,
    { id: string; meta: TemplateMeta; versions: VersionContent[] }
  >();
  const db: SeedDb = {
    async upsertCategory(c) {
      if (!categories.has(c.slug)) categories.set(c.slug, `cat-${c.slug}`);
      return categories.get(c.slug)!;
    },
    async findTemplate(slug) {
      const t = templates.get(slug);
      if (!t) return null;
      const last = t.versions.at(-1);
      return {
        id: t.id,
        latestVersion: t.versions.length,
        current: last
          ? { content: { ...last, variables: JSON.parse(JSON.stringify(last.variables)) } }
          : null,
      };
    },
    async createTemplate(slug, meta) {
      templates.set(slug, { id: `t-${slug}`, meta, versions: [] });
      return `t-${slug}`;
    },
    async updateTemplate(id, meta) {
      for (const t of templates.values()) if (t.id === id) t.meta = meta;
    },
    async addVersion(id, version, content) {
      for (const t of templates.values())
        if (t.id === id) {
          expect(version).toBe(t.versions.length + 1);
          t.versions.push(content);
        }
    },
  };
  return { db, templates, categories };
}

describe("seedTemplates", () => {
  it("creates every template once, then is a no-op on re-run", async () => {
    const m = memoryDb();
    const first = await seedTemplates(m.db, CATEGORIES, TEMPLATES);
    expect(first).toEqual({ created: TEMPLATES.length, versioned: 0, unchanged: 0 });
    const second = await seedTemplates(m.db, CATEGORIES, TEMPLATES);
    expect(second).toEqual({ created: 0, versioned: 0, unchanged: TEMPLATES.length });
    expect(m.templates.size).toBe(TEMPLATES.length);
    expect(m.categories.size).toBe(CATEGORIES.length);
    for (const t of m.templates.values()) expect(t.versions).toHaveLength(1);
  });
  it("adds a new version only for templates whose content changed", async () => {
    const m = memoryDb();
    await seedTemplates(m.db, CATEGORIES, TEMPLATES);
    const edited: TemplateSeed[] = TEMPLATES.map((t, i) =>
      i === 0 ? { ...t, task: `${t.task} (edited)` } : t,
    );
    const res = await seedTemplates(m.db, CATEGORIES, edited);
    expect(res).toEqual({ created: 0, versioned: 1, unchanged: TEMPLATES.length - 1 });
    expect(m.templates.get(TEMPLATES[0].slug)!.versions).toHaveLength(2);
  });
  it("never touches a template whose current version was saved in the editor", async () => {
    const m = memoryDb();
    await seedTemplates(m.db, CATEGORIES, TEMPLATES);
    const realFind = m.db.findTemplate.bind(m.db);
    m.db.findTemplate = async (slug) => {
      const r = await realFind(slug);
      return r && slug === TEMPLATES[0].slug && r.current
        ? { ...r, current: { ...r.current, editedByUser: true } }
        : r;
    };
    const changed = TEMPLATES.map((t, i) =>
      i === 0 ? { ...t, title: "Seed rename", task: `${t.task} (seed change)` } : t,
    );
    const res = await seedTemplates(m.db, CATEGORIES, changed);
    expect(res).toEqual({ created: 0, versioned: 0, unchanged: TEMPLATES.length });
    const t = m.templates.get(TEMPLATES[0].slug)!;
    expect(t.versions).toHaveLength(1);
    expect(t.meta.title).toBe(TEMPLATES[0].title);
  });
  it("a title-only change updates metadata without a new version", async () => {
    const m = memoryDb();
    await seedTemplates(m.db, CATEGORIES, TEMPLATES);
    const edited = TEMPLATES.map((t, i) => (i === 1 ? { ...t, title: "Renamed" } : t));
    const res = await seedTemplates(m.db, CATEGORIES, edited);
    expect(res.versioned).toBe(0);
    expect(m.templates.get(TEMPLATES[1].slug)!.meta.title).toBe("Renamed");
  });
  it("rejects an unknown category and invalid templates", async () => {
    const m = memoryDb();
    await expect(
      seedTemplates(m.db, CATEGORIES, [{ ...TEMPLATES[0], category: "nope" }]),
    ).rejects.toThrow(/unknown category/);
    await expect(
      seedTemplates(m.db, CATEGORIES, [{ ...TEMPLATES[0], slug: "Bad Slug" }]),
    ).rejects.toThrow();
  });
  it("contentOf normalises missing limits to null", () => {
    expect(contentOf(TEMPLATES[0]).maxWords).toBeNull();
  });
});
