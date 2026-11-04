import type { TemplateSeed, TemplateVariable } from "../../lib/templates/types";

export const CATEGORIES = [
  { slug: "internal-operations", name: "Internal operations", order: 1 },
  { slug: "patient-education", name: "Patient education & communication", order: 2 },
  { slug: "google-local-seo", name: "Google & local SEO", order: 3 },
  { slug: "social-reputation", name: "Social media & reputation", order: 4 },
  { slug: "email-retention", name: "Email marketing & retention", order: 5 },
  { slug: "practice-operations", name: "Practice operations & workflow", order: 6 },
] as const;

// Default guard-rails appended where the spec gives a template no constraints of its own.
const SAFE =
  "Do not invent facts, names, prices, dates or credentials; use only what is provided. " +
  "Give no clinical advice or diagnosis. Never confirm or imply that someone is a patient. " +
  "Respect the length limit.";

type V = Partial<Omit<TemplateVariable, "name" | "label" | "type">>;
const text = (name: string, label: string, o: V = {}): TemplateVariable => ({
  name,
  label,
  type: "text",
  required: true,
  ...o,
});
const num = (name: string, label: string, o: V = {}): TemplateVariable => ({
  name,
  label,
  type: "number",
  required: true,
  ...o,
});
const paste = (name: string, label: string, o: V = {}): TemplateVariable => ({
  name,
  label,
  type: "longtext-paste",
  required: true,
  ...o,
});
const profile = (name: string, label: string): TemplateVariable => ({
  name,
  label,
  type: "text",
  required: true,
  fromProfile: true,
});

const clinicName = profile("clinic_name", "Clinic name");
const city = profile("city", "City");
const phone = profile("phone", "Clinic phone");
const bookingUrl = profile("booking_url", "Booking URL");
const privacyRegime = profile("privacy_regime", "Privacy regime");

export const TEMPLATES: TemplateSeed[] = [
  // ---------- A. Internal operations ----------
  {
    slug: "first-week-onboarding-checklist",
    category: "internal-operations",
    title: "First-Week Onboarding Checklist",
    description: "Turn the onboarding manual into a day-by-day first-week checklist.",
    audience: "INTERNAL",
    role: "a clinic coordinator who trains new front-desk staff",
    context:
      "You are given the clinic's internal onboarding manual ({{page_count}} pages). It contains no patient data.",
    task: "Read the manual fully and turn it into a first-week checklist grouped by day.\n\nManual:\n{{manual_text}}",
    constraints:
      "Use only what the manual says. If two sections contradict each other, point it out instead of choosing one. Do not add new procedures.",
    outputFormat: 'A checkbox list for each day, then a final section "Questions for the manager".',
    variables: [
      num("page_count", "Manual length (pages)"),
      paste("manual_text", "Onboarding manual text"),
    ],
  },
  {
    slug: "coordination-meeting-minutes",
    category: "internal-operations",
    title: "Coordination Meeting Minutes",
    description:
      "Summarize a coordination meeting transcript into decisions, tasks and open topics.",
    audience: "INTERNAL",
    role: "the secretary of a medical center coordination meeting",
    context:
      "Below is the transcript of a {{meeting_length}}-minute meeting between {{participants}}. It contains no patient data.",
    task: "Summarize the meeting as decisions, open tasks and open topics.\n\nTranscript:\n{{transcript}}",
    constraints:
      "Do not invent owners or dates; write [to be confirmed] where they are missing. Maximum {{max_words}} words.",
    outputFormat:
      "Three blocks: Decisions; Tasks (with owner and date); Open topics. End with one sentence giving the next meeting date, if one is mentioned.",
    variables: [
      num("meeting_length", "Meeting length (minutes)", { default: "60" }),
      text("participants", "Participants", { default: "front desk, nursing and coordination" }),
      num("max_words", "Maximum words", { default: "250" }),
      paste("transcript", "Meeting transcript"),
    ],
    maxWords: 250,
  },
  {
    slug: "appointment-delay-protocol",
    category: "internal-operations",
    title: "Appointment Delay Communication Protocol",
    description: "A short protocol plus waiting-room, phone and SMS notices for late appointments.",
    audience: "INTERNAL",
    role: "a quality lead experienced in patient communication",
    context:
      "When an appointment runs more than {{delay_threshold}} minutes late, every team member gives notice differently. Current notices: {{current_notices}}",
    task: "Write a short delay-communication protocol and three notice templates: waiting room, phone call and SMS.",
    constraints:
      "Calm, respectful tone. Never promise times that cannot be met. No clinical explanations. Flag decisions that a team member must make.",
    outputFormat: "A 5-step protocol, then 3 templates with [bracket] blanks.",
    variables: [
      num("delay_threshold", "Delay threshold (minutes)", { default: "20" }),
      { ...text("current_notices", "Current notices"), type: "textarea" },
    ],
  },

  // ---------- B. Patient education & communication ----------
  {
    slug: "plain-language-test-result-explainer",
    category: "patient-education",
    title: "Plain-Language Test Result Explainer",
    description: "Explain anonymized lab results in plain language for a patient.",
    audience: "PATIENT_FACING",
    role: "a compassionate, patient-friendly medical communicator",
    context:
      "The patient is a {{age}}-year-old {{sex}} having a routine checkup. Results are anonymized.",
    task: "Explain these lab results at a {{reading_level}} reading level.\n\nResults:\n{{test_data}}",
    constraints:
      "Never diagnose and never recommend treatment. Always refer the patient to their doctor for interpretation. Do not invent values or reference ranges that are not provided.",
    outputFormat:
      "Bullets: what the test measures; what normal looks like; what this result means; two questions to ask the doctor.",
    variables: [
      num("age", "Age"),
      { ...text("sex", "Sex"), type: "select", options: ["female", "male", "other"] },
      text("reading_level", "Reading level", { default: "5th grade" }),
      paste("test_data", "Anonymized test data"),
    ],
  },
  {
    slug: "pre-visit-faq-generator",
    category: "patient-education",
    title: "Pre-Visit FAQ Generator",
    description: "A calming five-question FAQ for first-time patients of a procedure.",
    audience: "PATIENT_FACING",
    role: "an experienced front-desk nurse and patient coordinator",
    context: "The clinic is in {{city}}. Patients often worry about {{common_fear}}.",
    task: "Write a 5-question FAQ for first-time {{procedure}} patients.",
    constraints: `Warm, calming tone. Under 200 words. ${SAFE}`,
    outputFormat: "Question and answer pairs.",
    variables: [city, text("procedure", "Procedure"), text("common_fear", "Common fear")],
    maxWords: 200,
  },
  {
    slug: "post-visit-care-instructions",
    category: "patient-education",
    title: "Post-Visit Care Instructions Simplifier",
    description: "Rewrite discharge notes as plain-language home-care steps.",
    audience: "PATIENT_FACING",
    role: "a clinical educator",
    context: "The patient had the following procedure: {{procedure}}.",
    task: "Rewrite the discharge notes as plain-language home-care steps.\n\nDischarge notes:\n{{discharge_notes}}",
    constraints:
      "Do not add, remove or change any clinical instruction; only simplify the wording. Flag anything ambiguous for the clinician to confirm.",
    outputFormat: "A numbered list, with red-flag warning signs in bold at the bottom.",
    variables: [text("procedure", "Procedure"), paste("discharge_notes", "Discharge notes")],
  },

  // ---------- C. Google & local SEO ----------
  {
    slug: "google-business-profile-post",
    category: "google-local-seo",
    title: "Google Business Profile Post",
    description: "A 100-word local update for the clinic's Google Business Profile.",
    audience: "PATIENT_FACING",
    role: "a local healthcare marketing specialist",
    context: "The clinic is {{clinic_name}} in {{city}}.",
    task: 'Write a 100-word update announcing {{announcement}} at {{clinic_name}} in {{city}}, targeting the local keyword "{{local_keyword}}".',
    constraints: `Maximum 100 words. ${SAFE}`,
    outputFormat:
      "A hook, two benefit bullets, and a call to action with {{phone}} and {{booking_url}}.",
    variables: [
      clinicName,
      city,
      phone,
      bookingUrl,
      text("announcement", "Announcement"),
      text("local_keyword", "Local keyword"),
    ],
    maxWords: 100,
  },
  {
    slug: "local-service-area-page",
    category: "google-local-seo",
    title: "Local Service Area Page",
    description: "A 300-word service page section for a specialty in a local area.",
    audience: "PATIENT_FACING",
    role: "an SEO copywriter for medical practices",
    context: "The practice offers {{specialty}} services to people in {{area}}.",
    task: "Write a 300-word service page section for {{specialty}} in {{area}}. Tone: authoritative, trustworthy, empathetic.",
    constraints:
      "No unverifiable claims (for example 'best' or 'guaranteed'). Do not invent statistics, awards or credentials. Give no clinical advice.",
    outputFormat:
      "An H2 heading, an intro paragraph, three advantage bullets and a local call to action.",
    variables: [text("specialty", "Specialty"), text("area", "Service area")],
    maxWords: 300,
  },
  {
    slug: "faq-schema-writer",
    category: "google-local-seo",
    title: "FAQ Schema Writer",
    description: "Five search-friendly Q&As plus FAQPage JSON-LD.",
    audience: "PATIENT_FACING",
    role: "a technical SEO and medical content strategist",
    context: "The audience is prospective patients in {{city}}.",
    task: "Write 5 high-intent questions and answers about {{condition_or_treatment}}.",
    constraints:
      "General information only; recommend a consultation. Do not diagnose or promise outcomes. Do not invent facts.",
    outputFormat:
      "Each question with a 2-3 sentence answer suited to featured snippets, followed by valid FAQPage JSON-LD.",
    variables: [city, text("condition_or_treatment", "Condition or treatment")],
  },

  // ---------- D. Social media & reputation ----------
  {
    slug: "positive-review-response",
    category: "social-reputation",
    title: "Positive Review Response",
    description: "A gracious public reply to a 5-star review that reveals nothing about care.",
    audience: "PATIENT_FACING",
    role: "the Patient Relations Manager for {{clinic_name}}",
    context: "The clinic follows {{privacy_regime}} privacy rules. The review is public.",
    task: "Write a gracious, {{privacy_regime}}-compliant reply to this 5-star review:\n{{review_text}}",
    constraints:
      "Never confirm that the reviewer is a patient and never mention care details. Do not invent facts.",
    outputFormat: "2-4 warm sentences that invite them back.",
    variables: [clinicName, privacyRegime, paste("review_text", "Review text")],
  },
  {
    slug: "negative-review-deescalation",
    category: "social-reputation",
    title: "Negative Review De-escalation",
    description: "A calm public reply that moves the conversation offline.",
    audience: "PATIENT_FACING",
    role: "a Practice Director",
    context: "A reviewer has posted a negative public review:\n{{review_text}}",
    task: "Write a calm public reply that invites the reviewer to continue offline.",
    constraints:
      "Never argue. Never disclose or confirm medical information or patient status. Do not admit fault or invent facts.",
    outputFormat:
      "An acknowledgment followed by the practice manager contact: {{manager_contact}}.",
    variables: [
      paste("review_text", "Review text"),
      text("manager_contact", "Practice manager contact"),
    ],
  },
  {
    slug: "reel-hook-and-script",
    category: "social-reputation",
    title: "Reel Hook & Script",
    description: "A 30-second Reel script with a three-second hook.",
    audience: "PATIENT_FACING",
    role: "a social media producer for a modern clinic",
    context: "The Reel is for the clinic's social channels.",
    task: 'Write a 30-second Reel titled "3 things your {{specialty_role}} wishes you knew before turning 40". The hook must be under 3 seconds and the Reel must end with a prompt to follow the clinic.',
    constraints: `Keep it to about 30 seconds of speech. ${SAFE}`,
    outputFormat: "A two-column table: visual cue | spoken script.",
    variables: [text("specialty_role", "Specialist (e.g. dermatologist)")],
  },
  {
    slug: "staff-spotlight-caption",
    category: "social-reputation",
    title: "Staff Spotlight Caption",
    description: "A caption introducing a doctor with verified credentials only.",
    audience: "PATIENT_FACING",
    role: "a healthcare brand storyteller",
    context: "The caption introduces Dr. {{doctor_name}}, specializing in {{specialty}}.",
    task: "Write a caption introducing Dr. {{doctor_name}} that includes this fun fact: {{fun_fact}}",
    constraints: `Use credentials only from the list provided: {{credentials}}. Never invent credentials. ${SAFE}`,
    outputFormat: "A short paragraph, three credential bullets, and a call to action to book.",
    variables: [
      text("doctor_name", "Doctor's name"),
      text("specialty", "Specialty"),
      text("fun_fact", "Fun fact"),
      { ...text("credentials", "Credentials"), type: "textarea" },
    ],
  },

  // ---------- E. Email marketing & retention ----------
  {
    slug: "annual-checkup-reengagement-email",
    category: "email-retention",
    title: "Annual Check-up Re-engagement Email",
    description: "A gentle email to patients not seen for 12+ months.",
    audience: "PATIENT_FACING",
    role: "a patient-care coordinator",
    context: "{{clinic_name}} is writing to patients who have not visited in 12 months or more.",
    task: "Write a gentle, non-pushy email about preventive care that makes booking easy ({{booking_url}}).",
    constraints: `Do not mention any individual's health information. ${SAFE}`,
    outputFormat: "Three subject-line options, then a body under 150 words.",
    variables: [clinicName, bookingUrl],
    maxWords: 150,
  },
  {
    slug: "new-patient-welcome-email",
    category: "email-retention",
    title: "New Patient Welcome Email",
    description: "An automated welcome email sent after a first booking.",
    audience: "PATIENT_FACING",
    role: "the welcoming voice of {{clinic_name}}",
    context: "The email is sent automatically after a patient's first booking.",
    task: "Write a welcome email covering: parking ({{parking_notes}}); what to bring (ID, insurance card, medication list); and the intake link {{intake_url}}.",
    constraints: `Do not add details that are not provided. ${SAFE}`,
    outputFormat: "Scannable, with the action items in bold.",
    variables: [
      clinicName,
      { ...text("parking_notes", "Parking notes"), type: "textarea" },
      text("intake_url", "Intake form URL"),
    ],
  },
  {
    slug: "seasonal-preventive-campaign-email",
    category: "email-retention",
    title: "Seasonal Preventive Campaign Email",
    description: "A reminder email to schedule a seasonal preventive service.",
    audience: "PATIENT_FACING",
    role: "a public health communications writer",
    context: "Availability: {{availability}}",
    task: "Write a reminder to schedule {{campaign}}.",
    constraints: `Keep claims general and factual. ${SAFE}`,
    outputFormat:
      "A catchy subject line, three bullets on why early prevention matters, and a booking link ({{booking_url}}).",
    variables: [
      bookingUrl,
      text("campaign", "Campaign (e.g. flu shots)"),
      text("availability", "Availability"),
    ],
  },

  // ---------- F. Practice operations & workflow ----------
  {
    slug: "overdue-screening-reminder",
    category: "practice-operations",
    title: "Overdue Screening Reminder (SMS/Email)",
    description: "A privacy-safe reminder that a screening is due.",
    audience: "PATIENT_FACING",
    role: "a proactive practice manager",
    context: "{{clinic_name}} is reminding a patient that a {{screening}} is due.",
    task: "Write a privacy-safe reminder that a {{screening}} is due.",
    constraints:
      'The SMS must NOT name the condition or the test; say "a health check that is due". Never include health details in the email subject. Do not invent facts.',
    outputFormat: "An SMS of at most 160 characters, then a 3-sentence email.",
    variables: [clinicName, text("screening", "Screening")],
    maxChars: 160,
  },
  {
    // NOTE: the specification text for this template's constraints was cut off after
    // "any possible emergency ->". The constraints below are a conservative reading
    // and must be confirmed against the full specification (see docs/DECISIONS.md).
    slug: "phone-triage-escalation-guide",
    category: "practice-operations",
    title: "Phone Triage Escalation Guide",
    description: "A decision tree for receptionists: triage nurse, routine slot or emergency.",
    audience: "INTERNAL",
    role: "a medical office operations consultant",
    context:
      "Receptionists must decide whether to transfer to the triage nurse, book a routine slot, or direct the caller to emergency care.",
    task: "Write a decision tree for receptionists covering these scenarios: {{scenarios}}",
    constraints:
      "Any possible emergency must direct the caller to emergency services immediately, without waiting for a callback. Receptionists do not assess or diagnose; flag where the clinic's own protocol or a clinician must confirm the action. Give no clinical advice.",
    outputFormat: 'A list of the form "If [scenario] -> Then [action]".',
    variables: [
      {
        ...text("scenarios", "Scenarios", {
          default: "chest pain, high fever in an infant, medication refill, billing dispute",
        }),
        type: "textarea",
      },
    ],
  },
];
