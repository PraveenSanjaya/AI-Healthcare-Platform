import { describe, expect, it, vi } from "vitest";
import {
  TemplateNotFoundError,
  applyFilters,
  canUseTemplate,
  getTemplate,
  groupByCategory,
  listTemplates,
  setFavorite,
  type LibraryItem,
  type TemplateRepo,
  type TemplateRow,
} from "@/lib/templates/service";
import { AuthError } from "@/lib/auth/guards";

const ALL = ["ADMIN", "MANAGER", "STAFF"];
const row = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  id: "t1",
  slug: "t-one",
  title: "Review Reply",
  description: "Reply to reviews",
  audience: "PATIENT_FACING",
  archived: false,
  allowedRoles: ALL,
  category: { slug: "social", name: "Social media", order: 2 },
  current: {
    id: "v1",
    role: "a manager",
    context: "c",
    task: "t",
    constraints: "x",
    outputFormat: "o",
    variables: [],
    maxWords: null,
    maxChars: null,
  },
  ...over,
});

const rows: TemplateRow[] = [
  row(),
  row({
    id: "t2",
    slug: "t-two",
    title: "Meeting Minutes",
    description: "Summarize meetings",
    audience: "INTERNAL",
    category: { slug: "ops", name: "Internal operations", order: 1 },
  }),
  row({ id: "t3", slug: "t-three", title: "Admin Only", allowedRoles: ["ADMIN", "MANAGER"] }),
  row({ id: "t4", slug: "t-four", title: "Archived", archived: true }),
];

function repo(favs: string[] = []) {
  return {
    list: vi.fn(async () => rows),
    findBySlug: vi.fn(async (s: string) => rows.find((r) => r.slug === s) ?? null),
    favoriteTemplateIds: vi.fn(async () => favs),
    setFavorite: vi.fn(async () => {}),
  } satisfies TemplateRepo;
}
const as = (role: string) => ({ user: { id: "u1", role } });

describe("role-based visibility (server side)", () => {
  it("canUseTemplate: staff limited by allowedRoles, managers/admins see all, archived hidden", () => {
    expect(canUseTemplate("STAFF", rows[2])).toBe(false);
    expect(canUseTemplate("STAFF", rows[0])).toBe(true);
    expect(canUseTemplate("MANAGER", { allowedRoles: [], archived: false })).toBe(true);
    expect(canUseTemplate("ADMIN", rows[3])).toBe(false);
  });
  it("STAFF list excludes templates not enabled for STAFF", async () => {
    const slugs = (await listTemplates(as("STAFF"), repo())).map((t) => t.slug);
    expect(slugs).toEqual(["t-one", "t-two"]);
  });
  it("MANAGER list includes restricted templates", async () => {
    const slugs = (await listTemplates(as("MANAGER"), repo())).map((t) => t.slug);
    expect(slugs).toContain("t-three");
  });
  it("STAFF gets not-found (not the data) for a restricted template", async () => {
    await expect(getTemplate(as("STAFF"), repo(), "t-three")).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
    await expect(getTemplate(as("MANAGER"), repo(), "t-three")).resolves.toMatchObject({
      slug: "t-three",
    });
  });
  it("unknown slug and anonymous callers are rejected", async () => {
    await expect(getTemplate(as("ADMIN"), repo(), "nope")).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
    await expect(listTemplates(null, repo())).rejects.toBeInstanceOf(AuthError);
  });
  it("STAFF cannot favorite a restricted template", async () => {
    const r = repo();
    await expect(setFavorite(as("STAFF"), r, "t-three", true)).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
    expect(r.setFavorite).not.toHaveBeenCalled();
    await setFavorite(as("STAFF"), r, "t-one", true);
    expect(r.setFavorite).toHaveBeenCalledWith("u1", "t1", true);
  });
});

describe("filters and grouping", () => {
  const items = async (favs: string[] = []): Promise<LibraryItem[]> =>
    listTemplates(as("ADMIN"), repo(favs));
  it("marks favorites", async () => {
    const list = await items(["t2"]);
    expect(list.find((t) => t.id === "t2")!.favorite).toBe(true);
    expect(list.find((t) => t.id === "t1")!.favorite).toBe(false);
  });
  it("searches title, description and category case-insensitively", async () => {
    const list = await items();
    expect(applyFilters(list, { q: "MEETING" }).map((t) => t.slug)).toEqual(["t-two"]);
    expect(applyFilters(list, { q: "internal oper" }).map((t) => t.slug)).toEqual(["t-two"]);
    expect(applyFilters(list, { q: "zzz" })).toEqual([]);
  });
  it("filters by category, audience and favorites, and combines them", async () => {
    const list = await items(["t1"]);
    expect(applyFilters(list, { category: "ops" }).map((t) => t.slug)).toEqual(["t-two"]);
    expect(applyFilters(list, { audience: "INTERNAL" }).map((t) => t.slug)).toEqual(["t-two"]);
    expect(applyFilters(list, { favoritesOnly: true }).map((t) => t.slug)).toEqual(["t-one"]);
    expect(applyFilters(list, { favoritesOnly: true, category: "ops" })).toEqual([]);
  });
  it("groups by category in category order", async () => {
    const groups = groupByCategory(await items());
    expect(groups.map((g) => g.slug)).toEqual(["ops", "social"]);
    expect(groups[1].items.map((t) => t.slug)).toEqual(["t-one", "t-three"]);
  });
});
