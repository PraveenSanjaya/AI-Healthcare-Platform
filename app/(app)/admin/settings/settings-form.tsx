"use client";

import { useActionState } from "react";
import { BRAND_TONES, PRIVACY_REGIMES, type ClinicProfileData } from "@/lib/ai/profile";
import { saveSettingsAction } from "./actions";

const control = "mt-1 w-full rounded-md border px-3 py-2 font-normal read-only:bg-gray-100";

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={`s-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-gray-600">{hint}</p>}
      {error && (
        <p id={`s-${name}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SettingsForm({
  initial,
  canEditAll,
}: {
  initial: ClinicProfileData;
  canEditAll: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  const errors = state && !state.ok ? (state.errors as Record<string, string>) : {};
  const attrs = (name: keyof ClinicProfileData) => ({
    id: `s-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `s-${name}-error` : undefined,
  });
  // A manager sees these but cannot change them; the server enforces it too.
  const lockedProps = canEditAll ? {} : { readOnly: true };

  return (
    <form action={action} className="max-w-xl space-y-4" noValidate>
      <Field name="clinicName" label="Clinic name" error={errors.clinicName}>
        <input {...attrs("clinicName")} defaultValue={initial.clinicName} className={control} />
      </Field>
      <Field name="city" label="City or area" error={errors.city}>
        <input {...attrs("city")} defaultValue={initial.city} className={control} />
      </Field>
      <Field name="phone" label="Clinic phone" error={errors.phone}>
        <input {...attrs("phone")} defaultValue={initial.phone} className={control} />
      </Field>
      <Field name="bookingUrl" label="Booking URL" error={errors.bookingUrl}>
        <input {...attrs("bookingUrl")} defaultValue={initial.bookingUrl} className={control} />
      </Field>
      <Field name="addressNotes" label="Address and parking notes" error={errors.addressNotes}>
        <textarea
          {...attrs("addressNotes")}
          defaultValue={initial.addressNotes}
          rows={3}
          className={control}
        />
      </Field>
      <Field name="specialtyType" label="Specialty or clinic type" error={errors.specialtyType}>
        <input
          {...attrs("specialtyType")}
          defaultValue={initial.specialtyType}
          className={control}
        />
      </Field>
      <Field name="brandTone" label="Brand tone" error={errors.brandTone}>
        <select {...attrs("brandTone")} defaultValue={initial.brandTone} className={control}>
          {BRAND_TONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field
        name="defaultReadingLevel"
        label="Default reading level"
        error={errors.defaultReadingLevel}
        hint="For patient-facing text, for example 5th grade."
      >
        <input
          {...attrs("defaultReadingLevel")}
          defaultValue={initial.defaultReadingLevel}
          className={control}
        />
      </Field>
      <Field
        name="privacyRegime"
        label="Privacy regime"
        error={errors.privacyRegime}
        hint={canEditAll ? undefined : "Only an administrator can change this."}
      >
        {canEditAll ? (
          <select
            {...attrs("privacyRegime")}
            defaultValue={initial.privacyRegime}
            className={control}
          >
            {PRIVACY_REGIMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...attrs("privacyRegime")}
            defaultValue={initial.privacyRegime}
            {...lockedProps}
            className={control}
          />
        )}
      </Field>
      <Field
        name="emergencyNumber"
        label="Emergency number (required)"
        error={errors.emergencyNumber}
        hint={
          canEditAll
            ? "Shown first in the phone triage guide. Sri Lanka ambulance: 1990."
            : "Only an administrator can change this."
        }
      >
        <input
          {...attrs("emergencyNumber")}
          defaultValue={initial.emergencyNumber}
          required
          {...lockedProps}
          className={control}
        />
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-red-600">
          {errors.form}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-green-700">
          {state.changed.length ? "Settings saved." : "No changes to save."}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
