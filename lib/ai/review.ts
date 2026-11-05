import { AuthError, requireUser } from "@/lib/auth/guards";
import { AUDIT, type AuditEntry, type GenerationRepo } from "./generate";

type SessionLike = Parameters<typeof requireUser>[0];

export type ReviewResult =
  { ok: true; reviewedAt: string } | { ok: false; error: "UNAUTHENTICATED" | "NOT_FOUND" };

/**
 * Whether the Copy button may be used. Patient-facing text must be reviewed first;
 * internal text may be copied straight away.
 */
export function canCopy(audience: "INTERNAL" | "PATIENT_FACING", reviewed: boolean): boolean {
  return audience === "INTERNAL" || reviewed;
}

/**
 * Mark the caller's own generation as reviewed (sets reviewed and reviewedAt) and audit it.
 * Idempotent: a second call keeps the first timestamp and writes no second audit entry.
 * A generation that is not the caller's is reported as not found.
 */
export async function reviewGeneration(
  deps: {
    generations: Pick<GenerationRepo, "find" | "markReviewed">;
    audit: (entry: AuditEntry) => Promise<void>;
    now: () => Date;
  },
  session: SessionLike,
  generationId: string,
): Promise<ReviewResult> {
  let user;
  try {
    user = requireUser(session);
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "UNAUTHENTICATED" };
    throw e;
  }
  const g = await deps.generations.find(generationId);
  if (!g || g.userId !== user.id) return { ok: false, error: "NOT_FOUND" };
  if (g.reviewed && g.reviewedAt) return { ok: true, reviewedAt: g.reviewedAt.toISOString() };

  const at = deps.now();
  await deps.generations.markReviewed(g.id, at);
  await deps.audit({
    actorId: user.id,
    action: AUDIT.GENERATION_REVIEWED,
    entityType: "Generation",
    entityId: g.id,
    metadata: { refinements: g.refinements.length },
  });
  return { ok: true, reviewedAt: at.toISOString() };
}
