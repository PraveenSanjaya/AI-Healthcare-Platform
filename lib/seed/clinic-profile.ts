import { DEFAULT_CLINIC_PROFILE, type ClinicProfileData } from "@/lib/ai/profile";

/** Persistence port; prisma/seed.ts provides the Prisma implementation. */
export type ClinicProfileDb = {
  exists(): Promise<boolean>;
  create(data: ClinicProfileData): Promise<void>;
};

/**
 * Create the single ClinicProfile row (Sri Lanka, PDPA, warm tone, 5th-grade reading
 * level, emergency number 1990) if none exists. An existing row is never touched, so
 * re-seeding cannot overwrite what the clinic has configured.
 */
export async function seedClinicProfile(db: ClinicProfileDb): Promise<"created" | "unchanged"> {
  if (await db.exists()) return "unchanged";
  await db.create({ ...DEFAULT_CLINIC_PROFILE });
  return "created";
}
