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
