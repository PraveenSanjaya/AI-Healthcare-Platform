import { prisma } from "@/lib/db/prisma";
import { loadClinicProfile } from "@/lib/ai/repo";
import type { SettingsRepo } from "./service";

export const prismaSettingsRepo: SettingsRepo = {
  get: loadClinicProfile,
  async save(data) {
    await prisma.clinicProfile.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  },
};
