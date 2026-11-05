import { AUDIT, type AuditWriter } from "@/lib/audit/actions";
import { requireRole } from "@/lib/auth/guards";
import { sameContent, type VersionContent } from "@/lib/seed/templates";
import {
  changedFields,
  slugSchema,
  templateInputSchema,
  type TemplateContent,
  validateTemplateContent,
  type TemplateInput,
} from "./editor";

export type AdminTemplateRow = {
  id: string;
  slug: string;
  title: string;
  categoryName: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  archived: boolean;
  currentVersion: number | null;
};

export type AdminVersion = {
  version: number;
  createdAt: Date;
  createdByName: string | null;
  content: TemplateContent;
};

export type AdminTemplateDetail = {
  id: string;
  slug: string;
  archived: boolean;
  input: TemplateInput;
  currentVersion: number | null;
  /** Newest first. */
  versions: AdminVersion[];
};

export type AdminTemplateRepo = {
  listAll(): Promise<AdminTemplateRow[]>;
  getBySlug(slug: string): Promise<AdminTemplateDetail | null>;
  categories(): Promise<{ slug: string; name: string }[]>;
  create(slug: string, input: TemplateInput, userId: string): Promise<{ id: string }>;
  updateMeta(id: string, input: TemplateInput): Promise<void>;
  addVersion(id: string, input: TemplateInput, userId: string): Promise<number>;
  setArchived(id: string, archived: boolean): Promise<void>;
};

export type SaveResult =
  | { ok: true; slug: string; version: number | null; changed: string[] }
  | { ok: false; errors: string[] };

export class TemplateAdminNotFoundError extends Error {
  constructor() {
    super("Template not found");
    this.name = "TemplateAdminNotFoundError";
  }
}

type SessionLike = Parameters<typeof requireRole>[0];
type Deps = { repo: AdminTemplateRepo; audit: AuditWriter };

export async function listAllTemplates(session: SessionLike, repo: AdminTemplateRepo) {
  requireRole(session, "ADMIN");
  return repo.listAll();
}

export async function getTemplateForEdit(
  session: SessionLike,
  repo: AdminTemplateRepo,
  slug: string,
) {
  requireRole(session, "ADMIN");
  const detail = await repo.getBySlug(slug);
  if (!detail) throw new TemplateAdminNotFoundError();
  return detail;
}

/** Schema errors plus the placeholder/variable checks, as plain messages. */
export function checkInput(
  raw: unknown,
): { ok: true; input: TemplateInput } | { ok: false; errors: string[] } {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => {
        const where = i.path.length ? `${i.path.join(".")}: ` : "";
        return `${where}${i.message}`;
      }),
    };
  }
  const issues = validateTemplateContent(parsed.data);
  return issues.length ? { ok: false, errors: issues } : { ok: true, input: parsed.data };
}

const contentOf = (t: TemplateInput): VersionContent => ({
  role: t.role,
  context: t.context,
  task: t.task,
  constraints: t.constraints,
  outputFormat: t.outputFormat,
  variables: t.variables,
  maxWords: t.maxWords,
  maxChars: t.maxChars,
});

export async function createTemplate(
  session: SessionLike,
  deps: Deps,
  slugRaw: unknown,
  raw: unknown,
): Promise<SaveResult> {
  const user = requireRole(session, "ADMIN");
  const slug = slugSchema.safeParse(slugRaw);
  if (!slug.success) return { ok: false, errors: [slug.error.issues[0].message] };
  const checked = checkInput(raw);
  if (!checked.ok) return checked;
  if (!(await deps.repo.categories()).some((c) => c.slug === checked.input.categorySlug)) {
    return { ok: false, errors: ["That category does not exist."] };
  }
  if (await deps.repo.getBySlug(slug.data)) {
    return { ok: false, errors: [`A template with the slug "${slug.data}" already exists.`] };
  }
  const { id } = await deps.repo.create(slug.data, checked.input, user.id);
  await deps.audit({
    actorId: user.id,
    action: AUDIT.TEMPLATE_CREATED,
    entityType: "Template",
    entityId: id,
    metadata: { slug: slug.data, audience: checked.input.audience },
  });
  return { ok: true, slug: slug.data, version: 1, changed: [] };
}

/**
 * Saving a change to the wording or variables creates a NEW TemplateVersion; old generations
 * keep the version they used. A change to only the title, description, audience, category or
 * allowed roles updates the template in place and creates no version.
 */
export async function saveTemplate(
  session: SessionLike,
  deps: Deps,
  slug: string,
  raw: unknown,
): Promise<SaveResult> {
  const user = requireRole(session, "ADMIN");
  const current = await deps.repo.getBySlug(slug);
  if (!current) throw new TemplateAdminNotFoundError();
  const checked = checkInput(raw);
  if (!checked.ok) return checked;
  const next = checked.input;
  if (!(await deps.repo.categories()).some((c) => c.slug === next.categorySlug)) {
    return { ok: false, errors: ["That category does not exist."] };
  }

  const changed = changedFields(current.input, next);
  if (changed.length === 0) return { ok: true, slug, version: null, changed: [] };

  const currentVersion = current.versions[0];
  const contentChanged = !currentVersion || !sameContent(currentVersion.content, contentOf(next));

  await deps.repo.updateMeta(current.id, next);
  if (contentChanged) {
    const version = await deps.repo.addVersion(current.id, next, user.id);
    await deps.audit({
      actorId: user.id,
      action: AUDIT.TEMPLATE_VERSIONED,
      entityType: "Template",
      entityId: current.id,
      metadata: { slug, version, changed },
    });
    return { ok: true, slug, version, changed };
  }
  await deps.audit({
    actorId: user.id,
    action: AUDIT.TEMPLATE_UPDATED,
    entityType: "Template",
    entityId: current.id,
    metadata: { slug, changed },
  });
  return { ok: true, slug, version: null, changed };
}

export async function setTemplateArchived(
  session: SessionLike,
  deps: Deps,
  slug: string,
  archived: boolean,
): Promise<void> {
  const user = requireRole(session, "ADMIN");
  const current = await deps.repo.getBySlug(slug);
  if (!current) throw new TemplateAdminNotFoundError();
  if (current.archived === archived) return;
  await deps.repo.setArchived(current.id, archived);
  await deps.audit({
    actorId: user.id,
    action: AUDIT.TEMPLATE_ARCHIVED,
    entityType: "Template",
    entityId: current.id,
    metadata: { slug, archived },
  });
}
