import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AuditEntry, GenerationRepo } from "./generate";
import { DEFAULT_CLINIC_PROFILE, type ClinicProfileData } from "./profile";

export const prismaGenerationRepo: GenerationRepo = {
  async usageSince(userId, since) {
    const [gens, refs] = await Promise.all([
      prisma.generation.aggregate({
        where: { userId, createdAt: { gte: since } },
        _count: true,
        _min: { createdAt: true },
      }),
      prisma.generationRefinement.aggregate({
        where: { generation: { userId }, createdAt: { gte: since } },
        _count: true,
        _min: { createdAt: true },
      }),
    ]);
    const dates = [gens._min.createdAt, refs._min.createdAt].filter((d): d is Date => d !== null);
    return {
      count: gens._count + refs._count,
      oldest: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    };
  },
  async create(data) {
    const g = await prisma.generation.create({
      data: { ...data, inputs: data.inputs as Prisma.InputJsonValue },
      select: { id: true },
    });
    return g.id;
  },
  async find(id) {
    const g = await prisma.generation.findUnique({
      where: { id },
      include: { refinements: { orderBy: { createdAt: "asc" } } },
    });
    if (!g) return null;
    return {
      id: g.id,
      userId: g.userId,
      templateVersionId: g.templateVersionId,
      inputs: g.inputs as Record<string, string>,
      renderedPrompt: g.renderedPrompt,
      output: g.output,
      refinements: g.refinements.map((r) => ({ instruction: r.instruction, output: r.output })),
      reviewed: g.reviewed,
      reviewedAt: g.reviewedAt,
    };
  },
  async addRefinement(generationId, instruction, output) {
    return prisma.$transaction(async (tx) => {
      const r = await tx.generationRefinement.create({
        data: { generationId, instruction, output },
        select: { id: true },
      });
      // New text needs a new review.
      await tx.generation.update({
        where: { id: generationId },
        data: { reviewed: false, reviewedAt: null },
      });
      return r.id;
    });
  },
  async markReviewed(id, at) {
    await prisma.generation.update({ where: { id }, data: { reviewed: true, reviewedAt: at } });
  },
};

export async function writeAudit(e: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/** The single clinic profile row, or the Sri Lanka defaults if it has not been seeded. */
export async function loadClinicProfile(): Promise<ClinicProfileData> {
  const p = await prisma.clinicProfile.findUnique({ where: { id: 1 } });
  if (!p) return { ...DEFAULT_CLINIC_PROFILE };
  return {
    clinicName: p.clinicName,
    city: p.city,
    phone: p.phone,
    bookingUrl: p.bookingUrl,
    addressNotes: p.addressNotes,
    specialtyType: p.specialtyType,
    brandTone: p.brandTone,
    privacyRegime: p.privacyRegime,
    defaultReadingLevel: p.defaultReadingLevel,
    emergencyNumber: p.emergencyNumber,
  };
}
