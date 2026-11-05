import { describe, expect, it } from "vitest";
import { NOT_PROVIDED, RenderError, renderTemplate, type RenderableVersion } from "@/lib/ai/render";
import { DEFAULT_CLINIC_PROFILE, type ClinicProfileData } from "@/lib/ai/profile";
import { TEMPLATES } from "@/prisma/seed-data/templates";

const profile: ClinicProfileData = {
  ...DEFAULT_CLINIC_PROFILE,
  clinicName: "Lakeside Clinic",
  city: "Kandy",
  phone: "081 234 5678",
  bookingUrl: "https://lakeside.example/book",
};

const version: RenderableVersion = {
  role: "a coordinator for {{clinic_name}}",
  context: "Clinic is in {{city}}. Notes: {{notes}}",
  task: "Write {{count}} items about {{topic}} for {{audience}}.",
  constraints: "Be brief.",
  outputFormat: "Bullets with {{phone}}.",
  variables: [
    { name: "clinic_name", label: "Clinic name", type: "text", required: true, fromProfile: true },
    { name: "city", label: "City", type: "text", required: true, fromProfile: true },
    { name: "phone", label: "Phone", type: "text", required: true, fromProfile: true },
    { name: "notes", label: "Notes", type: "textarea", required: false },
    { name: "count", label: "Count", type: "number", required: true, default: "3" },
    { name: "topic", label: "Topic", type: "text", required: true },
    {
      name: "audience",
      label: "Audience",
      type: "select",
      required: true,
      options: ["adults", "children"],
    },
  ],
};

const inputs = { topic: "flu shots", audience: "adults" };

describe("renderTemplate", () => {
  it("fills inputs, profile values and defaults", () => {
    const r = renderTemplate(version, inputs, profile);
    expect(r.role).toBe("a coordinator for Lakeside Clinic");
    expect(r.task).toBe("Write 3 items about flu shots for adults.");
    expect(r.outputFormat).toBe("Bullets with 081 234 5678.");
  });
  it("lets user input override the clinic-profile value", () => {
    const r = renderTemplate(version, { ...inputs, city: "Colombo" }, profile);
    expect(r.context).toContain("Clinic is in Colombo.");
  });
  it("uses the clinic-profile value when the input is empty or blank", () => {
    expect(renderTemplate(version, inputs, profile).context).toContain("Clinic is in Kandy.");
    expect(renderTemplate(version, { ...inputs, city: "   " }, profile).context).toContain(
      "Clinic is in Kandy.",
    );
  });
  it("uses the input when the profile value is empty", () => {
    const r = renderTemplate(version, { ...inputs, city: "Galle" }, { ...profile, city: "" });
    expect(r.context).toContain("Clinic is in Galle.");
  });
  it("lets an input override a default", () => {
    expect(renderTemplate(version, { ...inputs, count: "5" }, profile).task).toContain("Write 5");
  });
  it("rejects missing required variables with a clear error naming each one", () => {
    try {
      renderTemplate(version, { audience: "adults" }, profile);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RenderError);
      expect((e as RenderError).missing).toEqual(["Topic (topic)"]);
      expect((e as Error).message).toBe("Missing required variable(s): Topic (topic).");
    }
  });
  it("treats whitespace-only input as missing", () => {
    expect(() => renderTemplate(version, { ...inputs, topic: "   " }, profile)).toThrow(
      /Missing required variable\(s\): Topic \(topic\)/,
    );
  });
  it("rejects a missing profile value with no input and no default", () => {
    expect(() => renderTemplate(version, inputs, { ...profile, phone: "" })).toThrow(
      /Phone \(phone\)/,
    );
  });
  it("lists several missing variables together", () => {
    expect(() => renderTemplate(version, {}, { ...profile, city: "" })).toThrow(
      /City \(city\), Topic \(topic\), Audience \(audience\)/,
    );
  });
  it("fills an empty optional variable with a visible marker", () => {
    expect(renderTemplate(version, inputs, profile).context).toContain(`Notes: ${NOT_PROVIDED}`);
  });
  it("rejects a non-numeric number and an unknown select option", () => {
    expect(() => renderTemplate(version, { ...inputs, count: "three" }, profile)).toThrow(
      /Count \(count\) must be a number/,
    );
    expect(() => renderTemplate(version, { ...inputs, audience: "pets" }, profile)).toThrow(
      /Audience \(audience\) must be one of: adults, children/,
    );
  });
  it("throws for a placeholder the template does not declare", () => {
    const broken = { ...version, task: "Write about {{surprise}}" };
    expect(() => renderTemplate(broken, inputs, profile)).toThrow(
      /undeclared variable\(s\): surprise/,
    );
  });
  it("never expands a placeholder typed into an input", () => {
    const r = renderTemplate(version, { ...inputs, topic: "{{phone}}" }, profile);
    expect(r.task).toContain("about {{phone}} for");
  });
  it("keeps special replacement patterns in input literal", () => {
    const r = renderTemplate(version, { ...inputs, topic: "costs $& and $1" }, profile);
    expect(r.task).toContain("costs $& and $1");
  });
  it("assembles the prompt in order with length limits", () => {
    const r = renderTemplate({ ...version, maxWords: 100, maxChars: 160 }, inputs, profile);
    const order = [
      "## Context",
      "## Task",
      "## Constraints",
      "## Length limit",
      "## Output format",
    ];
    const at = order.map((h) => r.prompt.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(r.prompt).toContain("Maximum 100 words. Maximum 160 characters.");
  });
  it("omits the length section when there is no limit", () => {
    expect(renderTemplate(version, inputs, profile).prompt).not.toContain("## Length limit");
  });
});

describe("renderTemplate with the seeded templates", () => {
  const sample = (v: RenderableVersion["variables"][number]) =>
    v.type === "number" ? "5" : v.type === "select" ? v.options![0] : `sample ${v.name}`;

  it.each(TEMPLATES.map((t) => [t.slug, t] as const))(
    "%s renders with no placeholder left",
    (_slug, t) => {
      const given = Object.fromEntries(t.variables.map((v) => [v.name, sample(v)]));
      const full = { ...profile, privacyRegime: "PDPA – Sri Lanka" };
      const r = renderTemplate(t, given, full);
      expect(r.prompt).not.toMatch(/\{\{/);
      expect(r.role).not.toMatch(/\{\{/);
    },
  );
  it("renders F2 with the default emergency number", () => {
    const f2 = TEMPLATES.find((t) => t.slug === "phone-triage-escalation-guide")!;
    const r = renderTemplate(f2, { scenarios: "chest pain" }, profile);
    expect(r.constraints).toContain("call 1990 FIRST");
  });
});
