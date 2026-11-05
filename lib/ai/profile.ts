/** The clinic settings the AI layer needs. Mirrors the ClinicProfile table, minus bookkeeping. */
export type ClinicProfileData = {
  clinicName: string;
  city: string;
  phone: string;
  bookingUrl: string;
  addressNotes: string;
  specialtyType: string;
  brandTone: string;
  privacyRegime: string;
  defaultReadingLevel: string;
  emergencyNumber: string;
};

/** Defaults for a clinic that has not filled in its profile (Sri Lanka). */
export const DEFAULT_CLINIC_PROFILE: ClinicProfileData = {
  clinicName: "",
  city: "",
  phone: "",
  bookingUrl: "",
  addressNotes: "",
  specialtyType: "",
  brandTone: "warm",
  privacyRegime: "PDPA – Sri Lanka",
  defaultReadingLevel: "5th grade",
  emergencyNumber: "1990",
};

/** Placeholder name -> profile value, for variables declared `fromProfile`. */
export function profileValues(profile: ClinicProfileData): Record<string, string> {
  return {
    clinic_name: profile.clinicName,
    city: profile.city,
    phone: profile.phone,
    booking_url: profile.bookingUrl,
    address_notes: profile.addressNotes,
    specialty_type: profile.specialtyType,
    brand_tone: profile.brandTone,
    privacy_regime: profile.privacyRegime,
    reading_level: profile.defaultReadingLevel,
    emergency_number: profile.emergencyNumber,
  };
}
