import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { GenerationRepo } from "./generate";
import { DEFAULT_CLINIC_PROFILE, type ClinicProfileData } from "./profile";

export const prismaGenerationRepo: GenerationRepo = {
  async reserve(userId, since, limit) {
    return prisma.$transaction(async (tx) => {
      // Serialise concurrent requests from one user for the length of this transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const agg = await tx.rateLimitHit.aggregate({
        where: { userId, createdAt: { gte: since } },
        _count: true,
        _min: { createdAt: true },
      });
      if (agg._count >= limit) {
        return { reserved: false, count: agg._count, oldest: agg._min.createdAt };
      }
      await tx.rateLimitHit.create({ data: { userId } });
      // Expired rows are of no further use.
      await tx.rateLimitHit.deleteMany({ where: { userId, createdAt: { lt: since } } });
      return { reserved: true, count: agg._count + 1, oldest: agg._min.createdAt };
    });
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

export { writeAudit } from "@/lib/audit/repo";

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
