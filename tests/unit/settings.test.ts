import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/guards";
import { DEFAULT_CLINIC_PROFILE, type ClinicProfileData } from "@/lib/ai/profile";
import {
  getSettings,
  settingsSchema,
  updateSettings,
  type SettingsRepo,
} from "@/lib/settings/service";
import type { AuditEntry } from "@/lib/audit/actions";

const base: ClinicProfileData = {
  ...DEFAULT_CLINIC_PROFILE,
  clinicName: "Lakeside Clinic",
  city: "Kandy",
  phone: "081 234 5678",
  bookingUrl: "https://lakeside.example/book",
};
const as = (role: string) => ({ user: { id: `u-${role}`, role } });

function setup(initial: ClinicProfileData = base) {
  let stored = initial;
  const audit: AuditEntry[] = [];
  const repo: SettingsRepo = {
    get: async () => stored,
    save: async (d) => {
      stored = d;
    },
  };
  return {
    deps: { repo, audit: async (e: AuditEntry) => void audit.push(e) },
    audit,
    stored: () => stored,
  };
}

describe("settingsSchema", () => {
  it("accepts the seeded defaults", () => {
    expect(settingsSchema.safeParse(DEFAULT_CLINIC_PROFILE).success).toBe(true);
  });
  it("requires a non-blank emergency number", () => {
    for (const emergencyNumber of ["", "   "]) {
      const r = settingsSchema.safeParse({ ...base, emergencyNumber });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe("Emergency number is required");
    }
  });
  it("accepts normal emergency numbers and rejects junk", () => {
    for (const v of ["1990", "112", "+94 11 269 1111", "911"]) {
      expect(settingsSchema.safeParse({ ...base, emergencyNumber: v }).success, v).toBe(true);
    }
    for (const v of ["call us", "1", "<script>", "0".repeat(21)]) {
      expect(settingsSchema.safeParse({ ...base, emergencyNumber: v }).success, v).toBe(false);
    }
  });
  it("validates the booking URL but allows it to be empty", () => {
    expect(settingsSchema.safeParse({ ...base, bookingUrl: "" }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, bookingUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(settingsSchema.safeParse({ ...base, bookingUrl: "book now" }).success).toBe(false);
  });
  it("limits tone and regime to the known values", () => {
    expect(settingsSchema.safeParse({ ...base, brandTone: "rude" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, privacyRegime: "None" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, privacyRegime: "GDPR – EU" }).success).toBe(true);
  });
  it("requires a reading level and trims values", () => {
    expect(settingsSchema.safeParse({ ...base, defaultReadingLevel: " " }).success).toBe(false);
    expect(settingsSchema.parse({ ...base, clinicName: "  A  " }).clinicName).toBe("A");
  });
  it("caps long fields", () => {
    expect(settingsSchema.safeParse({ ...base, addressNotes: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe("getSettings", () => {
  it("is open to managers and admins, flagging who may edit everything", async () => {
    const { deps } = setup();
    expect((await getSettings(as("MANAGER"), deps.repo)).canEditAll).toBe(false);
    expect((await getSettings(as("ADMIN"), deps.repo)).canEditAll).toBe(true);
  });
  it("is closed to STAFF and signed-out users", async () => {
    const { deps } = setup();
    await expect(getSettings(as("STAFF"), deps.repo)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSettings(null, deps.repo)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("updateSettings", () => {
  it("lets an admin change anything, and audits the field names", async () => {
    const { deps, audit, stored } = setup();
    const r = await updateSettings(as("ADMIN"), deps, {
      ...base,
      city: "Colombo",
      emergencyNumber: "119",
      privacyRegime: "GDPR – EU",
    });
    expect(r).toEqual({ ok: true, changed: ["city", "privacyRegime", "emergencyNumber"] });
    expect(stored()).toMatchObject({ city: "Colombo", emergencyNumber: "119" });
    expect(audit).toEqual([
      {
        actorId: "u-ADMIN",
        action: "SETTINGS_CHANGED",
        entityType: "ClinicProfile",
        entityId: "1",
        metadata: { changed: ["city", "privacyRegime", "emergencyNumber"], role: "ADMIN" },
      },
    ]);
  });
  it("lets a manager change the profile fields", async () => {
    const { deps, stored } = setup();
    const r = await updateSettings(as("MANAGER"), deps, {
      ...base,
      clinicName: "New Name",
      brandTone: "formal",
      defaultReadingLevel: "8th grade",
    });
    expect(r).toEqual({ ok: true, changed: ["clinicName", "brandTone", "defaultReadingLevel"] });
    expect(stored().clinicName).toBe("New Name");
  });
  it("stops a manager changing the privacy regime or emergency number", async () => {
    const { deps, audit, stored } = setup();
    const r = await updateSettings(as("MANAGER"), deps, {
      ...base,
      city: "Galle",
      emergencyNumber: "000",
      privacyRegime: "Generic",
    });
    expect(r).toEqual({
      ok: false,
      errors: {
        privacyRegime: "Only an administrator can change this",
        emergencyNumber: "Only an administrator can change this",
      },
    });
    expect(stored().city).toBe("Kandy"); // nothing was saved
    expect(audit).toEqual([]);
  });
  it("lets a manager resubmit the unchanged admin-only fields", async () => {
    const { deps } = setup();
    expect((await updateSettings(as("MANAGER"), deps, { ...base, city: "Galle" })).ok).toBe(true);
  });
  it("refuses STAFF and signed-out callers", async () => {
    const { deps, audit } = setup();
    await expect(updateSettings(as("STAFF"), deps, base)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateSettings(null, deps, base)).rejects.toBeInstanceOf(AuthError);
    expect(audit).toEqual([]);
  });
  it("returns field errors for invalid input and saves nothing", async () => {
    const { deps, audit, stored } = setup();
    const r = await updateSettings(as("ADMIN"), deps, {
      ...base,
      emergencyNumber: "",
      bookingUrl: "nope",
    });
    expect(r).toEqual({
      ok: false,
      errors: {
        bookingUrl: "Enter a full web address starting with http:// or https://",
        emergencyNumber: "Emergency number is required",
      },
    });
    expect(stored()).toEqual(base);
    expect(audit).toEqual([]);
  });
  it("does not audit a save that changes nothing", async () => {
    const { deps, audit } = setup();
    expect(await updateSettings(as("ADMIN"), deps, base)).toEqual({ ok: true, changed: [] });
    expect(audit).toEqual([]);
  });
  it("rejects a non-object body", async () => {
    const { deps } = setup();
    expect((await updateSettings(as("ADMIN"), deps, null)).ok).toBe(false);
  });
});
