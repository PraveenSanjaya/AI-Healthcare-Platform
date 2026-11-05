import { describe, expect, it } from "vitest";
import { seedClinicProfile, type ClinicProfileDb } from "@/lib/seed/clinic-profile";
import type { ClinicProfileData } from "@/lib/ai/profile";

function memoryDb(initial?: ClinicProfileData) {
  let row = initial ?? null;
  const db: ClinicProfileDb = {
    exists: async () => row !== null,
    create: async (data) => {
      row = data;
    },
  };
  return { db, get: () => row };
}

describe("seedClinicProfile", () => {
  it("creates the Sri Lanka / PDPA default when no row exists", async () => {
    const m = memoryDb();
    expect(await seedClinicProfile(m.db)).toBe("created");
    expect(m.get()).toMatchObject({
      privacyRegime: "PDPA – Sri Lanka",
      brandTone: "warm",
      defaultReadingLevel: "5th grade",
      emergencyNumber: "1990",
    });
  });
  it("is idempotent", async () => {
    const m = memoryDb();
    await seedClinicProfile(m.db);
    expect(await seedClinicProfile(m.db)).toBe("unchanged");
  });
  it("never overwrites an existing profile", async () => {
    const custom = {
      clinicName: "Custom",
      city: "Galle",
      phone: "",
      bookingUrl: "",
      addressNotes: "",
      specialtyType: "",
      brandTone: "formal",
      privacyRegime: "GDPR – EU",
      defaultReadingLevel: "8th grade",
      emergencyNumber: "112",
    };
    const m = memoryDb(custom);
    expect(await seedClinicProfile(m.db)).toBe("unchanged");
    expect(m.get()).toEqual(custom);
  });
});
