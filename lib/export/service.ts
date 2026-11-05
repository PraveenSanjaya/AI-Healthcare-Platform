import { AUDIT, type AuditWriter } from "@/lib/audit/actions";
import { AuthError, requireUser } from "@/lib/auth/guards";
import {
  HistoryNotFoundError,
  getHistoryDetail,
  latestDraft,
  type HistoryDetail,
  type HistoryRepo,
} from "@/lib/history/service";
import {
  FORMAT_INFO,
  buildDocx,
  buildMarkdown,
  buildPdf,
  isExportFormat,
  type ExportDoc,
  type ExportFormat,
} from "./builders";

export type ExportDeps = {
  history: HistoryRepo;
  audit: AuditWriter;
  now: () => Date;
};

type SessionLike = Parameters<typeof requireUser>[0];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The line printed on every export. Reviewed drafts name the reviewer and the date. */
export function exportFooter(
  d: Pick<HistoryDetail, "reviewed" | "reviewedAt" | "userName">,
): string {
  return d.reviewed && d.reviewedAt
    ? `AI draft — reviewed by ${d.userName} on ${isoDate(d.reviewedAt)}`
    : "AI draft — not reviewed";
}

/** Patient-facing drafts must be reviewed first; internal drafts may be exported at once. */
export const exportAllowed = (d: Pick<HistoryDetail, "audience" | "reviewed">) =>
  d.audience === "INTERNAL" || d.reviewed;

export function safeFileName(title: string, id: string, ext: string, now: Date): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "draft"}-${isoDate(now)}-${id.slice(-6)}.${ext}`;
}

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/export/[id]?format=md|docx|pdf. The review rule is enforced here, on the server,
 * so a hand-made request cannot get an unreviewed patient-facing draft.
 */
export async function handleExport(
  deps: ExportDeps,
  session: SessionLike,
  id: string,
  format: string | null,
): Promise<Response> {
  let user;
  try {
    user = requireUser(session);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: "UNAUTHENTICATED" }, 401);
    throw e;
  }
  if (!isExportFormat(format)) {
    return json({ error: "INVALID_FORMAT", message: "Use format=md, docx or pdf." }, 400);
  }

  let d: HistoryDetail;
  try {
    d = await getHistoryDetail(session, deps.history, id);
  } catch (e) {
    if (e instanceof HistoryNotFoundError) return json({ error: "NOT_FOUND" }, 404);
    throw e;
  }
  if (!exportAllowed(d)) {
    return json(
      { error: "REVIEW_REQUIRED", message: "Review this draft before exporting it." },
      409,
    );
  }

  const doc: ExportDoc = { title: d.templateTitle, body: latestDraft(d), footer: exportFooter(d) };
  const body: BodyInit =
    format === "md"
      ? buildMarkdown(doc)
      : format === "docx"
        ? new Blob([(await buildDocx(doc)) as BlobPart])
        : new Blob([(await buildPdf(doc)) as BlobPart]);

  await deps.audit({
    actorId: user.id,
    action: AUDIT.EXPORTED,
    entityType: "Generation",
    entityId: d.id,
    metadata: { format, templateSlug: d.templateSlug, reviewed: d.reviewed },
  });

  const info = FORMAT_INFO[format satisfies ExportFormat];
  return new Response(body, {
    headers: {
      "Content-Type": info.contentType,
      "Content-Disposition": `attachment; filename="${safeFileName(d.templateTitle, d.id, info.ext, deps.now())}"`,
      "Cache-Control": "no-store",
    },
  });
}
