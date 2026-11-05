import { z } from "zod";
import { AUDIT, type AuditWriter } from "@/lib/audit/actions";
import { requireRole } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/roles";
import { BRAND_TONES, PRIVACY_REGIMES, type ClinicProfileData } from "@/lib/ai/profile";

/**
 * Fields only an ADMIN may change. Managers can edit the rest of the clinic profile, but the
 * privacy regime and the emergency number are safety-relevant (they end up in every prompt).
 */
export const ADMIN_ONLY_FIELDS = ["privacyRegime", "emergencyNumber"] as const;

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

export const settingsSchema = z.object({
  clinicName: text(120),
  city: text(80),
  phone: text(40),
  bookingUrl: z
    .string()
    .trim()
    .max(300, "Keep it under 300 characters")
    .refine(
      (v) => v === "" || /^https?:\/\/\S+\.\S+$/i.test(v),
      "Enter a full web address starting with http:// or https://",
    ),
  addressNotes: text(1000),
  specialtyType: text(80),
  brandTone: z.enum(BRAND_TONES, { message: "Choose warm, formal or friendly" }),
  privacyRegime: z.enum(PRIVACY_REGIMES, { message: "Choose a privacy regime" }),
  defaultReadingLevel: z.string().trim().min(1, "Reading level is required").max(40),
  emergencyNumber: z
    .string()
    .trim()
    .min(1, "Emergency number is required")
    .regex(/^[0-9+][0-9 +-]{1,19}$/, "Use digits, spaces, + or - (2 to 20 characters)"),
}) satisfies z.ZodType<ClinicProfileData, unknown>;

export type SettingsRepo = {
  get(): Promise<ClinicProfileData>;
  save(data: ClinicProfileData): Promise<void>;
};

export type SettingsResult =
  { ok: true; changed: string[] } | { ok: false; errors: Record<string, string> };

type SessionLike = Parameters<typeof requireRole>[0];

/** Managers and admins may open the settings page. */
export async function getSettings(session: SessionLike, repo: SettingsRepo) {
  const user = requireRole(session, "MANAGER");
  return { settings: await repo.get(), canEditAll: hasRole(user.role, "ADMIN") };
}

const KEYS = Object.keys(settingsSchema.shape) as (keyof ClinicProfileData)[];

export async function updateSettings(
  session: SessionLike,
  deps: { repo: SettingsRepo; audit: AuditWriter },
  input: unknown,
): Promise<SettingsResult> {
  const user = requireRole(session, "MANAGER");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const current = await deps.repo.get();
  const next = parsed.data;
  const changed = KEYS.filter((k) => current[k] !== next[k]);

  if (!hasRole(user.role, "ADMIN")) {
    const blocked = changed.filter((k) => (ADMIN_ONLY_FIELDS as readonly string[]).includes(k));
    if (blocked.length) {
      return {
        ok: false,
        errors: Object.fromEntries(
          blocked.map((k) => [k, "Only an administrator can change this"]),
        ),
      };
    }
  }
  if (changed.length === 0) return { ok: true, changed: [] };

  await deps.repo.save(next);
  await deps.audit({
    actorId: user.id,
    action: AUDIT.SETTINGS_CHANGED,
    entityType: "ClinicProfile",
    entityId: "1",
    // Field names only; the values are clinic details, not needed to know what happened.
    metadata: { changed, role: user.role },
  });
  return { ok: true, changed };
}
