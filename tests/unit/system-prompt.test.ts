import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";
import { DEFAULT_CLINIC_PROFILE, profileValues, type ClinicProfileData } from "@/lib/ai/profile";

const profile: ClinicProfileData = {
  clinicName: "Lakeside Family Clinic",
  city: "Kandy",
  phone: "081 234 5678",
  bookingUrl: "https://lakeside.example/book",
  addressNotes: "Opposite the post office",
  specialtyType: "Family medicine",
  brandTone: "friendly",
  privacyRegime: "PDPA – Sri Lanka",
  defaultReadingLevel: "6th grade",
  emergencyNumber: "1990",
};

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt(profile, { role: "a patient-care coordinator" });

  it("starts with the clinic profile and ends with the template role", () => {
    expect(prompt.indexOf("Lakeside Family Clinic")).toBeLessThan(prompt.indexOf("## Rules"));
    expect(prompt.indexOf("## Rules")).toBeLessThan(prompt.indexOf("a patient-care coordinator"));
    expect(prompt.trimEnd().endsWith("a patient-care coordinator")).toBe(true);
  });
  it("includes the clinic details that were provided", () => {
    for (const s of ["Kandy", "081 234 5678", "https://lakeside.example/book", "Family medicine"]) {
      expect(prompt).toContain(s);
    }
  });
  it("forbids diagnosis, prescribing, treatment and dosages, and asks for a marked blank", () => {
    expect(prompt).toMatch(/Never diagnose, prescribe, recommend treatments or give dosages/);
    expect(prompt).toMatch(/licensed clinician must decide/);
    expect(prompt).toMatch(/marked blank/);
  });
  it("requires using only provided information and [to be confirmed]", () => {
    expect(prompt).toMatch(/Use only the information provided/);
    expect(prompt).toMatch(/names, dates, owners, prices, phone numbers or procedures/);
    expect(prompt).toContain("[to be confirmed]");
  });
  it("tells the model to point out contradictions", () => {
    expect(prompt).toMatch(/contradicts itself, point the contradiction out/);
  });
  it("forbids confirming patient status and names the privacy regime", () => {
    expect(prompt).toMatch(/Never confirm or imply that any individual is a patient/);
    expect(prompt).toContain("(privacy regime: PDPA – Sri Lanka)");
  });
  it("states the tone and the default reading level", () => {
    expect(prompt).toContain("Tone: friendly.");
    expect(prompt).toContain("Default reading level for patient-facing text: 6th grade.");
  });
  it("requires the exact output format in Markdown", () => {
    expect(prompt).toMatch(/Follow the requested output format exactly, and respond in Markdown/);
  });
  it("leaves no rule placeholders unfilled", () => {
    expect(prompt).not.toMatch(/\{\{/);
  });
  it("fills profile placeholders in the role", () => {
    const p = buildSystemPrompt(profile, {
      role: "the Patient Relations Manager for {{clinic_name}}",
    });
    expect(p).toContain("the Patient Relations Manager for Lakeside Family Clinic");
  });
  it("fills regime, tone and reading level placeholders in the role", () => {
    const p = buildSystemPrompt(profile, {
      role: "writer ({{privacy_regime}}, {{brand_tone}}, {{reading_level}})",
    });
    expect(p).toContain("writer (PDPA – Sri Lanka, friendly, 6th grade)");
  });
  it("leaves a placeholder it cannot answer untouched", () => {
    const p = buildSystemPrompt(profile, { role: "writer for {{unknown_thing}}" });
    expect(p).toContain("{{unknown_thing}}");
  });
  it("does not use an empty profile value for a placeholder", () => {
    const p = buildSystemPrompt(DEFAULT_CLINIC_PROFILE, { role: "manager of {{clinic_name}}" });
    expect(p).toContain("manager of {{clinic_name}}");
  });
  it("omits clinic lines that are empty", () => {
    const p = buildSystemPrompt(DEFAULT_CLINIC_PROFILE, { role: "writer" });
    expect(p).not.toMatch(/Clinic:|Phone:|Booking URL:|City:/);
    expect(p).toContain("Privacy regime: PDPA – Sri Lanka");
  });
  it("falls back to defaults for blank tone, regime and reading level", () => {
    const p = buildSystemPrompt(
      { ...profile, brandTone: " ", privacyRegime: "", defaultReadingLevel: "" },
      { role: "writer" },
    );
    expect(p).toContain("Tone: warm.");
    expect(p).toContain("privacy regime: PDPA – Sri Lanka");
    expect(p).toContain("reading level for patient-facing text: 5th grade.");
  });
});

describe("profileValues", () => {
  it("maps profile fields to placeholder names", () => {
    expect(profileValues(profile)).toMatchObject({
      clinic_name: "Lakeside Family Clinic",
      booking_url: "https://lakeside.example/book",
      privacy_regime: "PDPA – Sri Lanka",
      reading_level: "6th grade",
      emergency_number: "1990",
    });
  });
});

describe("DEFAULT_CLINIC_PROFILE", () => {
  it("is Sri Lanka, PDPA, warm, 5th grade, emergency 1990", () => {
    expect(DEFAULT_CLINIC_PROFILE).toMatchObject({
      privacyRegime: "PDPA – Sri Lanka",
      brandTone: "warm",
      defaultReadingLevel: "5th grade",
      emergencyNumber: "1990",
    });
  });
});
