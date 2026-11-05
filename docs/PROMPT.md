# ClinicAssist — Build Specification

Partial specification. Sections for later phases are appended as they are provided.

## Section 3 — Roles (RBAC)

- Admin: everything; manage users, clinic settings, templates, audit logs, stats.
- Manager: use all templates, view team history, analytics, edit clinic profile.
- Staff: use templates enabled for their role, view own history.

Enforce roles on the server (route handlers, server actions, proxy), not just by hiding UI. Tests must prove Staff gets 403 on admin endpoints.

## Section 9 — Phase 2 (Auth & RBAC)

Auth.js credentials login, seeded admin user (credentials from .env: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), role-guard helpers, middleware/proxy, user management page (Admin: list users, create user, change role, activate/deactivate; cannot deactivate or demote yourself).

Exit criteria: tests for login and 403 on wrong role.

## Section 13 — Git workflow (summary)

- **13.1** Before the first commit and before every push, show: `git config user.name`, `git config user.email`, `git remote -v`, `gh auth status`. Must be PraveenSanjaya, the noreply email, remote PraveenSanjaya/AI-Healthcare-Platform. Stop and ask if anything differs.
- **13.2** One logical change per commit; stage specific files, never `git add .` for a whole phase. ~10-15 meaningful commits per phase; no empty or filler commits. Each commit must build and pass existing tests.
- **13.3** Format: `<type>(<feature>): <imperative description, max 72 chars>`. Types: feat fix test docs refactor style chore build ci perf. Feature scopes include: setup docker db auth rbac users clinic-profile templates seed library favorites phi-detector system-prompt renderer llm-provider runner streaming refine review history export template-editor versioning analytics audit-log rate-limit a11y security e2e docs.
- **13.4** One branch per phase, push regularly, PR via `gh pr create`, merged with a merge commit (never squash). Never force-push, rebase pushed branches, or amend pushed commits.
- **13.5** After each phase report: `git log --oneline` for the phase, total commit count (`git rev-list --count HEAD`), and push confirmation.

## Section 4.2 — Template library

- Browse templates grouped by category; search; filters (category, audience: INTERNAL vs PATIENT_FACING).
- Card: title, category, short description, "Act as" role, Patient-facing badge.
- Users can favorite templates (Favorite table); a "Favorites" filter.
- Template detail page /templates/[slug]: shows role, task, context, constraints, output format and the variable list (the runner form comes in Phase 5; show a disabled "Run (coming in Phase 5)" button, not a fake one).
- STAFF only see templates enabled for their role (add Template.allowedRoles, default all roles). Enforce on the server.

## Section 8 — Seed data

Seed ALL 24 templates via prisma/seed.ts (idempotent upserts by slug; running the seed twice must create no duplicates; editing seed text creates a new TemplateVersion only if content changed). Store template data in prisma/seed-data/templates.ts. Each template: slug, category, title, description, audience, role, context, task, constraints, outputFormat, variables [{name,label,type(text|textarea|number|select|longtext-paste),required,default?,options?,helpText?,fromProfile?}], maxWords?, maxChars?. Use {{snake_case}} placeholders. Where a template mentions HIPAA, use {{privacy_regime}}. Templates without constraints get sensible ones (no invented facts, no clinical advice, never confirm patient status, length). Variables like clinic_name, city, phone, booking_url, privacy_regime are fromProfile (filled from the clinic profile later).

> **Note:** the specification as received was cut off mid-sentence in F2, and it lists 18 templates, not 24. The remaining text and templates are to be appended when provided.

### Category A — Internal operations

- **A1 First-Week Onboarding Checklist** (INTERNAL). Role: clinic coordinator who trains new front-desk staff. Context: internal onboarding manual of {{page_count}} pages, no patient data. Task: read it fully, turn it into a first-week checklist grouped by day. Constraints: only what the manual says; if two sections contradict, point it out instead of choosing; no new procedures. Output: checkbox list per day + "Questions for the manager". Vars: page_count(number), manual_text(longtext-paste, required).
- **A2 Coordination Meeting Minutes** (INTERNAL). Role: secretary of a medical center coordination meeting. Context: transcript of a {{meeting_length}}-min meeting between {{participants}}, no patient data. Task: summarize as decisions, open tasks, open topics. Constraints: no invented owners/dates, write [to be confirmed]; max {{max_words}} words (default 250). Output: three blocks (Decisions; Tasks with owner and date; Open topics) + final sentence with next meeting date if present. Vars: meeting_length(default 60), participants(default "front desk, nursing and coordination"), max_words(default 250), transcript(longtext-paste). maxWords 250.
- **A3 Appointment Delay Communication Protocol** (INTERNAL). Role: quality lead experienced in patient communication. Context: when an appointment runs more than {{delay_threshold}} min late, everyone gives notice differently; current notices: {{current_notices}}. Task: short delay-communication protocol + 3 templates (waiting room, phone call, SMS). Constraints: calm respectful tone; never promise times that can't be met; no clinical explanations; flag decisions a team member must make. Output: 5-step protocol + 3 templates with [bracket] blanks. Vars: delay_threshold(default 20), current_notices.

### Category B — Patient education & communication

- **B1 Plain-Language Test Result Explainer** (PATIENT_FACING). Role: compassionate, patient-friendly medical communicator. Task: explain anonymized lab results at {{reading_level}} reading level (default 5th grade). Context: {{age}}-year-old {{sex}}, routine checkup. Output bullets: what the test measures / what normal looks like / what this result means / 2 questions to ask the doctor. Constraint: never diagnose or recommend treatment; always refer to the doctor. Vars: age, sex(select), reading_level, test_data(longtext-paste).
- **B2 Pre-Visit FAQ Generator** (PATIENT_FACING). Role: experienced front-desk nurse and patient coordinator. Task: 5-question FAQ for first-time {{procedure}} patients. Context: clinic in {{city}}; patients often worry about {{common_fear}}. Output: Q&A, warm calming tone, under 200 words. maxWords 200.
- **B3 Post-Visit Care Instructions Simplifier** (PATIENT_FACING). Role: clinical educator. Task: rewrite discharge notes as plain-language home-care steps. Context: {{procedure}}. Output: numbered list, red-flag warning signs in bold at the bottom. Constraint: don't add, remove or change any clinical instruction; only simplify wording; flag anything ambiguous. Vars: procedure, discharge_notes(longtext-paste).

### Category C — Google & local SEO

- **C1 Google Business Profile Post.** Role: local healthcare marketing specialist. Task: 100-word update announcing {{announcement}} at {{clinic_name}} in {{city}}, targeting "{{local_keyword}}". Output: hook, 2 benefit bullets, CTA with {{phone}} / {{booking_url}}. maxWords 100.
- **C2 Local Service Area Page.** Role: SEO copywriter for medical practices. Task: 300-word service page section for {{specialty}} in {{area}}; authoritative, trustworthy, empathetic. Output: H2, intro paragraph, 3 advantage bullets, local CTA. Constraint: no unverifiable claims ("best", "guaranteed").
- **C3 FAQ Schema Writer.** Role: technical SEO and medical content strategist. Task: 5 high-intent Q&As about {{condition_or_treatment}} for prospective patients in {{city}}. Output: question + 2-3 sentence answer for featured snippets, plus FAQPage JSON-LD. Constraint: general info only; recommend a consultation.

### Category D — Social media & reputation

- **D1 Positive Review Response.** Role: Patient Relations Manager for {{clinic_name}}. Task: gracious, {{privacy_regime}}-compliant reply to a 5-star review: {{review_text}}. Constraint: never confirm patient status or care details. Output: 2-4 sentences, warm, invite them back.
- **D2 Negative Review De-escalation.** Role: Practice Director. Task: calm public reply inviting the reviewer offline. Constraints: never argue; never disclose or confirm medical info or patient status. Output: acknowledgment + practice manager contact {{manager_contact}}. Vars: review_text, manager_contact.
- **D3 Reel Hook & Script.** Role: social media producer for a modern clinic. Task: 30-second Reel "3 things your {{specialty_role}} wishes you knew before turning 40". Hook under 3 seconds; end with prompt to follow the clinic. Output: two-column table (visual cue | spoken script).
- **D4 Staff Spotlight Caption.** Role: healthcare brand storyteller. Task: caption introducing Dr. {{doctor_name}}, specializing in {{specialty}}, with fun fact {{fun_fact}}. Output: short paragraph + 3 credential bullets (only from {{credentials}}, never invented) + CTA to book.

### Category E — Email marketing & retention

- **E1 Annual Check-up Re-engagement Email.** Role: patient-care coordinator. Task: gentle, non-pushy email to patients not seen in 12+ months; preventive care, easy booking. Output: 3 subject-line options + body under 150 words.
- **E2 New Patient Welcome Email.** Role: welcoming voice of {{clinic_name}}. Task: automated welcome email after first booking: parking {{parking_notes}}, what to bring (ID, insurance card, medication list), intake link {{intake_url}}. Output: scannable, bold action items.
- **E3 Seasonal Preventive Campaign Email.** Role: public health communications writer. Task: reminder to schedule {{campaign}}. Context: {{availability}}. Output: catchy subject, 3 bullets on why early prevention matters, booking link.

### Category F — Practice operations & workflow

- **F1 Overdue Screening Reminder (SMS/Email)** (PATIENT_FACING). Role: proactive practice manager. Task: privacy-safe reminder that a {{screening}} is due. Constraint: the SMS must NOT name the condition or test (use "a health check that is due"). Output: SMS <=160 chars + 3-sentence email. maxChars 160.
- **F2 Phone Triage Escalation Guide** (INTERNAL). Role: medical office operations consultant. Task: decision tree for receptionists: transfer to triage nurse / book routine slot / direct to emergency. Scenarios {{scenarios}} (default: chest pain, high fever in an infant, medication refill, billing dispute). Output: "If [scenario] -> Then [action]" list. Constraints: any possible emergency -> advise calling {{emergency_number}} (default 1990) FIRST; add the banner "Must be approved by the clinic's medical director before use"; no diagnosis; no treatment advice.
- **F3 Daily Huddle Agenda** (INTERNAL). Role: efficient clinic administrator. Task: 5-minute huddle agenda: high-complexity patients (no names), wait times, lab follow-up bottlenecks, staff shoutouts. Output: timed outline (0-2 / 2-4 / 4-5 min). Vars: focus_notes (textarea, optional).
- **F4 Plain-English SOP Draft** (INTERNAL). Role: healthcare compliance and operations writer. Task: turn {{rough_notes}} into an SOP for {{sop_topic}}, readable by a new medical assistant in under 2 minutes. Output: Objective -> Required tools/access -> Step-by-step -> Escalation contact. Constraint: only steps in the notes; flag gaps. Vars: sop_topic, rough_notes (longtext-paste).
- **F5 Patient Satisfaction Micro-Survey** (PATIENT_FACING). Role: patient experience officer. Task: 4-question survey: front-desk courtesy, wait time, provider communication, likelihood to recommend; under 60 seconds. Output: 1 rating-scale question + 3 multiple-choice or open-text questions.
- **F6 Homepage Hero Section** (PATIENT_FACING). Role: healthcare UX copywriter. Task: 3 hero variations (headline, subheadline, button text) for {{clinic_name}}, a {{center_type}} center in {{city}}. Output: A Trust/Authority, B Convenience/Speed, C Warmth/Family Care.
- **F7 Red-Flag Cheat-Sheet for Medical Assistants** (INTERNAL). Role: clinical supervisor. Task: rapid-reference table of red-flag symptoms that require interrupting the physician immediately. Output: table (Symptom -> Immediate action -> Who to notify). Constraints: header "Must be reviewed and approved by the clinic's medical director before use"; no treatment steps.
- **F8 Monthly Performance Summary** (INTERNAL). Role: healthcare data analyst. Task: from {{metrics}} (patient volume, no-show rate, average wait, staff hours): top 3 wins, top 3 bottlenecks, recommendations. Output: executive summary, bulleted insights, priority action checklist. Constraint: only conclusions the numbers support; state assumptions. Vars: metrics (longtext-paste).

That makes 24 templates (A1-A3, B1-B3, C1-C3, D1-D4, E1-E3, F1-F8).
