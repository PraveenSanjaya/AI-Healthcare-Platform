import { requireUser, AuthError } from "@/lib/auth/guards";
import { type AppRole } from "@/lib/auth/roles";

export type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  archived: boolean;
  allowedRoles: string[];
  category: { slug: string; name: string; order: number };
  current: {
    id: string;
    role: string;
    context: string;
    task: string;
    constraints: string;
    outputFormat: string;
    variables: unknown;
    maxWords: number | null;
    maxChars: number | null;
  } | null;
};

export type TemplateRepo = {
  list(): Promise<TemplateRow[]>;
  findBySlug(slug: string): Promise<TemplateRow | null>;
  favoriteTemplateIds(userId: string): Promise<string[]>;
  setFavorite(userId: string, templateId: string, on: boolean): Promise<void>;
};

type SessionLike = Parameters<typeof requireUser>[0];

export class TemplateNotFoundError extends Error {
  constructor() {
    super("Template not found");
    this.name = "TemplateNotFoundError";
  }
}

/** ADMIN and MANAGER use every template; STAFF only those enabled for STAFF. */
export function canUseTemplate(role: AppRole, t: Pick<TemplateRow, "allowedRoles" | "archived">) {
  if (t.archived) return false;
  return role === "ADMIN" || role === "MANAGER" || t.allowedRoles.includes(role);
}

export type LibraryFilters = {
  q?: string;
  category?: string;
  audience?: "INTERNAL" | "PATIENT_FACING";
  favoritesOnly?: boolean;
};

export type LibraryItem = TemplateRow & { favorite: boolean };

/** Pure filter used by the library page (and unit-tested). */
export function applyFilters(items: LibraryItem[], f: LibraryFilters): LibraryItem[] {
  const q = f.q?.trim().toLowerCase();
  return items.filter((t) => {
    if (f.category && t.category.slug !== f.category) return false;
    if (f.audience && t.audience !== f.audience) return false;
    if (f.favoritesOnly && !t.favorite) return false;
    if (q) {
      const hay = `${t.title} ${t.description} ${t.category.name} ${t.current?.role ?? ""}`;
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function groupByCategory(items: LibraryItem[]) {
  const groups = new Map<
    string,
    { slug: string; name: string; order: number; items: LibraryItem[] }
  >();
  for (const t of items) {
    const g = groups.get(t.category.slug) ?? { ...t.category, items: [] };
    g.items.push(t);
    groups.set(t.category.slug, g);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

export async function listTemplates(
  session: SessionLike,
  repo: TemplateRepo,
): Promise<LibraryItem[]> {
  const user = requireUser(session);
  const [rows, favs] = await Promise.all([repo.list(), repo.favoriteTemplateIds(user.id)]);
  const favSet = new Set(favs);
  return rows
    .filter((t) => canUseTemplate(user.role, t))
    .map((t) => ({ ...t, favorite: favSet.has(t.id) }));
}

/** Hidden templates are reported as not found, so STAFF cannot probe for them. */
export async function getTemplate(
  session: SessionLike,
  repo: TemplateRepo,
  slug: string,
): Promise<LibraryItem> {
  const user = requireUser(session);
  const t = await repo.findBySlug(slug);
  if (!t || !canUseTemplate(user.role, t)) throw new TemplateNotFoundError();
  const favs = await repo.favoriteTemplateIds(user.id);
  return { ...t, favorite: favs.includes(t.id) };
}

export async function setFavorite(
  session: SessionLike,
  repo: TemplateRepo,
  slug: string,
  on: boolean,
) {
  const user = requireUser(session);
  const t = await repo.findBySlug(slug);
  if (!t || !canUseTemplate(user.role, t)) throw new TemplateNotFoundError();
  await repo.setFavorite(user.id, t.id, on);
}

export { AuthError };
