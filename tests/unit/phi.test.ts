import { describe, expect, it } from "vitest";
import { detectPHI, redactPHI, type PhiType } from "@/lib/safety/phi";

const types = (text: string) => detectPHI(text).map((f) => f.type);
const matches = (text: string, type: PhiType) =>
  detectPHI(text)
    .filter((f) => f.type === type)
    .map((f) => f.match);

describe("detectPHI true positives", () => {
  it("finds emails", () => {
    expect(matches("Write to kamal.perera+clinic@mail.example.co.uk today", "email")).toEqual([
      "kamal.perera+clinic@mail.example.co.uk",
    ]);
  });
  it("finds Sri Lankan mobile numbers with and without spaces", () => {
    expect(matches("Call 077 123 4567 or 0712345678", "phone")).toEqual([
      "077 123 4567",
      "0712345678",
    ]);
  });
  it("finds +94 numbers", () => {
    expect(matches("WhatsApp +94 77 123 4567 please", "phone")).toEqual(["+94 77 123 4567"]);
    expect(matches("+94771234567", "phone")).toEqual(["+94771234567"]);
  });
  it("finds other international and North American numbers", () => {
    expect(matches("UK: +44 20 7946 0958", "phone")).toHaveLength(1);
    expect(matches("US: (555) 123-4567", "phone")).toEqual(["(555) 123-4567"]);
    expect(matches("US: 555-123-4567", "phone")).toEqual(["555-123-4567"]);
  });
  it("finds old and new NICs", () => {
    expect(matches("NIC 853151234V", "nic")).toEqual(["853151234V"]);
    expect(matches("NIC 853151234x", "nic")).toEqual(["853151234x"]);
    expect(matches("NIC 198531512345", "nic")).toEqual(["198531512345"]);
  });
  it("finds US SSNs", () => {
    expect(matches("SSN 123-45-6789.", "ssn")).toEqual(["123-45-6789"]);
  });
  it("finds passport-like IDs, bare and with a cue", () => {
    expect(matches("Passport N1234567 expires", "passport")).toEqual(["N1234567"]);
    expect(matches("passport no: 123456789", "passport")).toEqual(["123456789"]);
    expect(matches("Her ID is AB123456", "passport")).toEqual(["AB123456"]);
  });
  it("finds dates of birth near a cue", () => {
    expect(matches("DOB: 12/03/1985", "dob")).toEqual(["DOB: 12/03/1985"]);
    expect(matches("Date of birth 3 March 1985", "dob")).toHaveLength(1);
    expect(matches("born on March 3, 1985", "dob")).toHaveLength(1);
    expect(matches("born in 1985", "dob")).toEqual(["born in 1985"]);
  });
  it("labels a cued date as dob, not date", () => {
    expect(types("DOB: 1985-03-12")).toEqual(["dob"]);
  });
  it("finds full dates in general", () => {
    expect(matches("Seen on 2024-05-17 and 17/05/2024", "date")).toEqual([
      "2024-05-17",
      "17/05/2024",
    ]);
    expect(matches("Booked for 5th May 2024", "date")).toHaveLength(1);
    expect(matches("Booked for May 5, 2024", "date")).toHaveLength(1);
  });
  it("finds medical record and patient IDs", () => {
    expect(matches("MRN: 00123456", "mrn")).toEqual(["MRN: 00123456"]);
    expect(matches("Patient ID: PT-8841", "mrn")).toEqual(["Patient ID: PT-8841"]);
    expect(matches("Medical record number 99887766", "mrn")).toHaveLength(1);
    expect(matches("chart no. 5521", "mrn")).toHaveLength(1);
  });
  it("finds street addresses", () => {
    expect(matches("Lives at 45 Galle Road, Colombo", "address")).toEqual(["45 Galle Road"]);
    expect(matches("12 Park Avenue", "address")).toEqual(["12 Park Avenue"]);
    expect(matches("No. 7/2 Temple Mawatha", "address")).toHaveLength(1);
  });
  it("finds postal codes with a cue and in common formats", () => {
    expect(matches("Postal code: 10100", "postal_code")).toEqual(["10100"]);
    expect(matches("ZIP 90210-1234", "postal_code")).toEqual(["90210-1234"]);
    expect(matches("Postcode SW1A 1AA", "postal_code")).toEqual(["SW1A 1AA"]);
  });
  it("flags names near cues", () => {
    expect(matches("Please call Mr. Kamal Perera", "name")).toEqual(["Kamal Perera"]);
    expect(matches("Dr. Silva will see you", "name")).toEqual(["Silva"]);
    expect(matches("Patient name: Nimali Fernando", "name")).toEqual(["Nimali Fernando"]);
    expect(matches("Name: Saman", "name")).toEqual(["Saman"]);
    expect(matches("the patient Kasun Jayasuriya arrived", "name")).toEqual(["Kasun Jayasuriya"]);
  });
  it("reports correct offsets", () => {
    const text = "Mail a@b.lk now";
    const [f] = detectPHI(text);
    expect(text.slice(f.start, f.end)).toBe(f.match);
    expect(f.start).toBe(5);
  });
  it("returns findings sorted by position", () => {
    const text = "a@b.lk then 077 123 4567 then x@y.lk";
    const starts = detectPHI(text).map((f) => f.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts).toHaveLength(3);
  });
});

describe("detectPHI true negatives", () => {
  it.each([
    "The visit takes 20 minutes.",
    "Written at a 5th-grade reading level.",
    "Please go to Room 3 on the first floor.",
    "Open 9am-5pm, Monday to Friday.",
    "Keep the SMS under 160 characters.",
    "A 5-year-old child with 3 questions.",
    "Version 2.5.1 of the app",
    "Server at 192.168.1.10",
    "Takes about 100 words and 2 bullets.",
    "Call us for a patient experience survey.",
    "The Patient Education team reviews this.",
    "Parking is on the 2nd floor.",
  ])("ignores %j", (text) => {
    expect(detectPHI(text)).toEqual([]);
  });
  it("ignores unfilled placeholders", () => {
    expect(detectPHI("Call [Phone Number] or email [Email Address]")).toEqual([]);
    expect(detectPHI("Call {{phone}} or book at {{booking_url}}")).toEqual([]);
    expect(detectPHI("Dr. {{doctor_name}}, DOB: {{dob}}")).toEqual([]);
    expect(detectPHI("Patient ID: [Patient ID]")).toEqual([]);
  });
  it("still detects data inside square brackets that contain digits", () => {
    expect(types("[0771234567]")).toEqual(["phone"]);
  });
  it("handles empty and whitespace input", () => {
    expect(detectPHI("")).toEqual([]);
    expect(detectPHI("   \n  ")).toEqual([]);
  });
});

describe("detectPHI edge cases", () => {
  it("reports an overlapping NIC once", () => {
    expect(detectPHI("NIC 198531512345")).toHaveLength(1);
  });
  it("finds several types in one text", () => {
    const t = "Kamal, DOB: 12/03/1985, MRN 445566, phone 0771234567, a@b.lk";
    expect(new Set(types(t))).toEqual(new Set(["dob", "mrn", "phone", "email"]));
  });
  it("is stable across repeated calls", () => {
    const t = "a@b.lk";
    expect(detectPHI(t)).toEqual(detectPHI(t));
  });
  it("handles very long input", () => {
    const t = "word ".repeat(20000) + "a@b.lk";
    expect(detectPHI(t)).toHaveLength(1);
  });
});

describe("redactPHI", () => {
  it("replaces matches with typed markers", () => {
    expect(redactPHI("Email a@b.lk or call 0771234567.")).toBe(
      "Email [REDACTED-EMAIL] or call [REDACTED-PHONE].",
    );
  });
  it("uses hyphenated labels", () => {
    expect(redactPHI("Postal code: 10100")).toBe("Postal code: [REDACTED-POSTAL-CODE]");
  });
  it("leaves names alone by default but can redact them", () => {
    expect(redactPHI("Mr. Kamal Perera")).toBe("Mr. Kamal Perera");
    expect(redactPHI("Mr. Kamal Perera", { includeNames: true })).toBe("Mr. [REDACTED-NAME]");
  });
  it("leaves clean text unchanged", () => {
    const t = "The visit takes 20 minutes in Room 3.";
    expect(redactPHI(t)).toBe(t);
  });
  it("is idempotent", () => {
    const once = redactPHI("DOB: 12/03/1985 and 077 123 4567");
    expect(redactPHI(once)).toBe(once);
    expect(once).toBe("[REDACTED-DOB] and [REDACTED-PHONE]");
  });
  it("keeps surrounding text and placeholders intact", () => {
    expect(redactPHI("Hi {{clinic_name}}, SSN 123-45-6789!")).toBe(
      "Hi {{clinic_name}}, SSN [REDACTED-SSN]!",
    );
  });
});
