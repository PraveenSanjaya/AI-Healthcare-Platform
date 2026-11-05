import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/prisma/seed-data/templates";
import {
  diffVersions,
  sampleInputs,
  slugSchema,
  slugify,
  templateInputSchema,
  validateTemplateContent,
  type TemplateInput,
} from "@/lib/templates/editor";
import {
  TemplateAdminNotFoundError,
  checkInput,
  createTemplate,
  getTemplateForEdit,
  listAllTemplates,
  saveTemplate,
  setTemplateArchived,
  type AdminTemplateDetail,
  type AdminTemplateRepo,
  type AdminVersion,
} from "@/lib/templates/admin-service";
import type { AuditEntry } from "@/lib/audit/actions";
import { AuthError } from "@/lib/auth/guards";
import { renderTemplate } from "@/lib/ai/render";
import { DEFAULT_CLINIC_PROFILE } from "@/lib/ai/profile";

const input = (over: Partial<TemplateInput> = {}): TemplateInput => ({
  categorySlug: "email-retention",
  title: "Welcome",
  description: "A welcome note",
  audience: "PATIENT_FACING",
  allowedRoles: ["ADMIN", "MANAGER", "STAFF"],
  role: "a writer for {{clinic_name}}",
  context: "Write to {{name}}",
  task: "Write a note",
  constraints: "Be kind",
  outputFormat: "Short",
  variables: [
    { name: "clinic_name", label: "Clinic", type: "text", required: true, fromProfile: true },
    { name: "name", label: "Name", type: "text", required: true },
  ],
  maxWords: null,
  maxChars: null,
  ...over,
});

function memoryRepo(seed?: { slug: string; input: TemplateInput }) {
  type T = {
    id: string;
    slug: string;
    archived: boolean;
    input: TemplateInput;
    versions: AdminVersion[];
  };
  const items = new Map<string, T>();
  const addV = (t: T, i: TemplateInput) =>
    t.versions.unshift({
      version: t.versions.length + 1,
      createdAt: new Date("2026-11-05T10:00:00Z"),
      createdByName: "Admin",
      content: {
        role: i.role,
        context: i.context,
        task: i.task,
        constraints: i.constraints,
        outputFormat: i.outputFormat,
        variables: i.variables,
        maxWords: i.maxWords,
        maxChars: i.maxChars,
      },
    });
  if (seed) {
    const t: T = {
      id: `id-${seed.slug}`,
      slug: seed.slug,
      archived: false,
      input: seed.input,
      versions: [],
    };
    addV(t, seed.input);
    items.set(seed.slug, t);
  }
  const repo: AdminTemplateRepo = {
    listAll: async () =>
      [...items.values()].map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.input.title,
        categoryName: t.input.categorySlug,
        audience: t.input.audience,
        archived: t.archived,
        currentVersion: t.versions[0]?.version ?? null,
      })),
    getBySlug: async (slug) => {
      const t = items.get(slug);
      return t
        ? ({
            id: t.id,
            slug: t.slug,
            archived: t.archived,
            input: t.input,
            currentVersion: t.versions[0]?.version ?? null,
            versions: t.versions,
          } satisfies AdminTemplateDetail)
        : null;
    },
    categories: async () => [{ slug: "email-retention", name: "Email" }],
    create: async (slug, i) => {
      const t: T = { id: `id-${slug}`, slug, archived: false, input: i, versions: [] };
      addV(t, i);
      items.set(slug, t);
      return { id: t.id };
    },
    updateMeta: async (id, i) => {
      for (const t of items.values()) if (t.id === id) t.input = i;
    },
    addVersion: async (id, i) => {
      for (const t of items.values())
        if (t.id === id) {
          addV(t, i);
          return t.versions[0].version;
        }
      throw new Error("missing");
    },
    setArchived: async (id, a) => {
      for (const t of items.values()) if (t.id === id) t.archived = a;
    },
  };
  const audit: AuditEntry[] = [];
  return { repo, audit, deps: { repo, audit: async (e: AuditEntry) => void audit.push(e) }, items };
}
const as = (role: string) => ({ user: { id: `u-${role}`, role } });

describe("slug helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("  Plain-Language Test Result Explainer! ")).toBe(
      "plain-language-test-result-explainer",
    );
    expect(slugify("???")).toBe("");
  });
  it("validates slugs", () => {
    expect(slugSchema.safeParse("good-slug-2").success).toBe(true);
    for (const bad of ["Bad", "a b", "-x", "x-", "a--b", "a"]) {
      expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("validateTemplateContent: placeholders and variables", () => {
  it("accepts a consistent template", () => {
    expect(validateTemplateContent(input())).toEqual([]);
  });
  it("flags a placeholder with no variable", () => {
    const issues = validateTemplateContent(input({ task: "Write to {{ghost}}" }));
    expect(issues).toEqual(["{{ghost}} is used in the template but has no variable."]);
  });
  it("flags a variable that is never used", () => {
    const issues = validateTemplateContent(
      input({
        variables: [
          ...input().variables,
          { name: "spare", label: "Spare", type: "text", required: false },
        ],
      }),
    );
    expect(issues).toEqual(['Variable "spare" is never used as {{spare}} in the template.']);
  });
  it("flags duplicate variable names", () => {
    const v = input().variables;
    expect(validateTemplateContent(input({ variables: [...v, v[1]] }))).toContain(
      'Variable name "name" appears more than once.',
    );
  });
  it("checks select options and defaults", () => {
    const sel = (options?: string[], def?: string) =>
      input({
        context: "Tone {{tone}} and {{clinic_name}}",
        role: "x",
        variables: [
          { name: "clinic_name", label: "C", type: "text", required: true, fromProfile: true },
          { name: "tone", label: "Tone", type: "select", required: true, options, default: def },
        ],
      });
    expect(validateTemplateContent(sel(undefined))).toEqual([
      '"tone" is a select, so it needs at least one option.',
    ]);
    expect(validateTemplateContent(sel(["a", "b"], "c"))).toEqual([
      'The default of "tone" must be one of its options.',
    ]);
    expect(validateTemplateContent(sel(["a", "b"], "a"))).toEqual([]);
  });
  it("checks number defaults", () => {
    const v = input({
      context: "{{n}} {{clinic_name}}",
      role: "x",
      variables: [
        { name: "clinic_name", label: "C", type: "text", required: true, fromProfile: true },
        { name: "n", label: "N", type: "number", required: true, default: "many" },
      ],
    });
    expect(validateTemplateContent(v)).toEqual(['The default of "n" must be a number.']);
  });
  it("only lets known clinic-profile fields be filled from the profile", () => {
    const v = input({
      variables: [
        { name: "clinic_name", label: "C", type: "text", required: true, fromProfile: true },
        { name: "name", label: "N", type: "text", required: true, fromProfile: true },
      ],
    });
    expect(validateTemplateContent(v)[0]).toContain(
      '"name" cannot be filled from the clinic profile',
    );
  });
  it("accepts every seeded template", () => {
    for (const t of TEMPLATES) expect(validateTemplateContent(t), t.slug).toEqual([]);
  });
});

describe("templateInputSchema", () => {
  it("requires the text fields, a valid audience and sane limits", () => {
    expect(templateInputSchema.safeParse(input()).success).toBe(true);
    for (const bad of [
      { title: " " },
      { description: "" },
      { role: "" },
      { audience: "PUBLIC" },
      { maxWords: 0 },
      { maxChars: 1.5 },
      { allowedRoles: ["ROOT"] },
    ]) {
      expect(templateInputSchema.safeParse(input(bad as never)).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
  it("checkInput reports schema and placeholder problems as messages", () => {
    const r = checkInput({ ...input(), title: "" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toBe("title: Title is required");
    expect(checkInput(input({ task: "{{x}}" })).ok).toBe(false);
    expect(checkInput(input()).ok).toBe(true);
  });
});

describe("diffVersions and sampleInputs", () => {
  const a = input();
  it("is empty for identical content", () => {
    expect(diffVersions(a, a)).toEqual([]);
  });
  it("reports changed text and limits", () => {
    const d = diffVersions(a, { ...a, task: "New task", maxWords: 50 });
    expect(d).toEqual([
      { field: "task", before: "Write a note", after: "New task" },
      { field: "maxWords", before: "none", after: "50" },
    ]);
  });
  it("reports added, removed and changed variables", () => {
    const next = {
      ...a,
      variables: [
        { ...a.variables[0], required: false },
        { name: "extra", label: "Extra", type: "text" as const, required: true },
      ],
    };
    const d = diffVersions(a, next);
    expect(d.map((x) => x.field)).toEqual([
      "variable clinic_name",
      "variable name",
      "variable extra",
    ]);
    expect(d[1].after).toBe("(removed)");
    expect(d[2].before).toBe("(not present)");
  });
  it("builds sample inputs from defaults, options and labels", () => {
    expect(
      sampleInputs([
        { name: "a", label: "A", type: "text", required: true },
        { name: "b", label: "B", type: "number", required: true },
        { name: "c", label: "C", type: "select", required: true, options: ["x", "y"] },
        { name: "d", label: "D", type: "text", required: true, default: "dflt" },
      ]),
    ).toEqual({ a: "[A]", b: "5", c: "x", d: "dflt" });
  });
  it("sample inputs render every seeded template", () => {
    for (const t of TEMPLATES) {
      const r = renderTemplate(t, sampleInputs(t.variables), DEFAULT_CLINIC_PROFILE);
      expect(r.prompt, t.slug).not.toMatch(/\{\{/);
    }
  });
});

describe("admin service: roles", () => {
  it("is ADMIN only", async () => {
    const { repo, deps } = memoryRepo({ slug: "w", input: input() });
    for (const role of ["MANAGER", "STAFF"]) {
      await expect(listAllTemplates(as(role), repo)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getTemplateForEdit(as(role), repo, "w")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(createTemplate(as(role), deps, "n", input())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(saveTemplate(as(role), deps, "w", input())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(setTemplateArchived(as(role), deps, "w", true)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(listAllTemplates(null, repo)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("admin service: create", () => {
  it("creates version 1 and audits TEMPLATE_CREATED", async () => {
    const { deps, audit, items } = memoryRepo();
    const r = await createTemplate(as("ADMIN"), deps, "welcome-note", input());
    expect(r).toEqual({ ok: true, slug: "welcome-note", version: 1, changed: [] });
    expect(items.get("welcome-note")!.versions).toHaveLength(1);
    expect(audit).toEqual([
      {
        actorId: "u-ADMIN",
        action: "TEMPLATE_CREATED",
        entityType: "Template",
        entityId: "id-welcome-note",
        metadata: { slug: "welcome-note", audience: "PATIENT_FACING" },
      },
    ]);
  });
  it("rejects a bad slug, a duplicate slug, a missing category and invalid content", async () => {
    const { deps, audit } = memoryRepo({ slug: "taken", input: input() });
    expect((await createTemplate(as("ADMIN"), deps, "Bad Slug", input())).ok).toBe(false);
    const dup = await createTemplate(as("ADMIN"), deps, "taken", input());
    expect(dup).toEqual({
      ok: false,
      errors: ['A template with the slug "taken" already exists.'],
    });
    const cat = await createTemplate(as("ADMIN"), deps, "fresh", input({ categorySlug: "nope" }));
    expect(cat).toEqual({ ok: false, errors: ["That category does not exist."] });
    expect(
      (await createTemplate(as("ADMIN"), deps, "fresh", input({ task: "{{ghost}}" }))).ok,
    ).toBe(false);
    expect(audit).toEqual([]);
  });
});

describe("admin service: versioning", () => {
  it("a wording change creates version 2 and keeps version 1", async () => {
    const { deps, audit, items } = memoryRepo({ slug: "w", input: input() });
    const r = await saveTemplate(as("ADMIN"), deps, "w", input({ task: "Write a longer note" }));
    expect(r).toEqual({ ok: true, slug: "w", version: 2, changed: ["task"] });
    const t = items.get("w")!;
    expect(t.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(t.versions[1].content.task).toBe("Write a note");
    expect(t.versions[0].content.task).toBe("Write a longer note");
    expect(audit[0]).toMatchObject({
      action: "TEMPLATE_VERSIONED",
      metadata: { slug: "w", version: 2, changed: ["task"] },
    });
  });
  it("a variable change creates a new version too", async () => {
    const { deps } = memoryRepo({ slug: "w", input: input() });
    const v = input().variables.map((x) =>
      x.name === "name" ? { ...x, label: "Patient name" } : x,
    );
    const r = await saveTemplate(as("ADMIN"), deps, "w", input({ variables: v }));
    expect(r).toMatchObject({ ok: true, version: 2, changed: ["variables"] });
  });
  it("a metadata-only change updates in place with no new version", async () => {
    const { deps, audit, items } = memoryRepo({ slug: "w", input: input() });
    const r = await saveTemplate(
      as("ADMIN"),
      deps,
      "w",
      input({ title: "Renamed", allowedRoles: ["ADMIN", "MANAGER"] }),
    );
    expect(r).toEqual({ ok: true, slug: "w", version: null, changed: ["title", "allowedRoles"] });
    expect(items.get("w")!.versions).toHaveLength(1);
    expect(items.get("w")!.input.title).toBe("Renamed");
    expect(audit[0].action).toBe("TEMPLATE_UPDATED");
  });
  it("saving unchanged content does nothing", async () => {
    const { deps, audit } = memoryRepo({ slug: "w", input: input() });
    expect(await saveTemplate(as("ADMIN"), deps, "w", input())).toEqual({
      ok: true,
      slug: "w",
      version: null,
      changed: [],
    });
    expect(audit).toEqual([]);
  });
  it("rejects invalid edits without saving", async () => {
    const { deps, audit, items } = memoryRepo({ slug: "w", input: input() });
    const r = await saveTemplate(as("ADMIN"), deps, "w", input({ task: "Use {{ghost}}" }));
    expect(r.ok).toBe(false);
    expect(items.get("w")!.versions).toHaveLength(1);
    expect(audit).toEqual([]);
  });
  it("reports an unknown slug", async () => {
    const { deps } = memoryRepo();
    await expect(saveTemplate(as("ADMIN"), deps, "nope", input())).rejects.toBeInstanceOf(
      TemplateAdminNotFoundError,
    );
  });
});

describe("admin service: archive", () => {
  it("archives and unarchives with an audit entry each time", async () => {
    const { deps, audit, items } = memoryRepo({ slug: "w", input: input() });
    await setTemplateArchived(as("ADMIN"), deps, "w", true);
    expect(items.get("w")!.archived).toBe(true);
    await setTemplateArchived(as("ADMIN"), deps, "w", false);
    expect(items.get("w")!.archived).toBe(false);
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      ["TEMPLATE_ARCHIVED", { slug: "w", archived: true }],
      ["TEMPLATE_ARCHIVED", { slug: "w", archived: false }],
    ]);
  });
  it("does not audit a no-op", async () => {
    const { deps, audit } = memoryRepo({ slug: "w", input: input() });
    await setTemplateArchived(as("ADMIN"), deps, "w", false);
    expect(audit).toEqual([]);
  });
  it("lists archived and active templates", async () => {
    const { deps, repo } = memoryRepo({ slug: "w", input: input() });
    await setTemplateArchived(as("ADMIN"), deps, "w", true);
    const rows = await listAllTemplates(as("ADMIN"), repo);
    expect(rows).toHaveLength(1);
    expect(rows[0].archived).toBe(true);
  });
});
