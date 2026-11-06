# Safety layer

**The PHI/PII detector is a safeguard, not a guarantee.** It is a set of pattern-based heuristics. It will miss some personal information and will occasionally flag text that is harmless. It does not make it safe to paste patient data into ClinicAssist, and it does not make output compliant with HIPAA, PDPA, GDPR or any other regime. People remain responsible for what they enter and what they publish.

## What `detectPHI` looks for

`lib/safety/phi.ts` exports `detectPHI(text)`, which returns `{type, match, start, end}` findings, and `redactPHI(text)`.

| Type          | Examples                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `email`       | `name@example.com`                                                           |
| `phone`       | `077 123 4567`, `0112345678`, `+94 77 123 4567`, `(555) 123-4567`            |
| `nic`         | Sri Lankan NIC: `853151234V`, `198531512345`                                 |
| `ssn`         | US SSN: `123-45-6789`                                                        |
| `passport`    | `N1234567`, `passport no: 123456789`                                         |
| `dob`         | a date after `DOB`, `date of birth`, `born (on)`; `born in 1985`             |
| `date`        | any full date: `2024-05-17`, `17/05/2024`, `5th May 2024`, `May 5, 2024`     |
| `mrn`         | `MRN: 00123456`, `Patient ID: PT-8841`, `medical record number ...`          |
| `address`     | `45 Galle Road`, `12 Park Avenue`, `No. 7/2 Temple Mawatha`                  |
| `postal_code` | after `postal code`/`ZIP`, ZIP+4, UK postcodes                               |
| `name`        | the name after `Mr.`/`Mrs.`/`Ms.`/`Dr.`, `patient`, `name:` (flag only). A title after a cue (`Patient Mr. Silva`) is part of the cue: one name finding (`Silva`), one `[REDACTED-NAME]` |

Unfilled placeholders such as `[Phone Number]` and `{{phone}}` are ignored. Square brackets that contain digits are not treated as placeholders, so `[0771234567]` is still caught.

## Redaction

`redactPHI` replaces each finding with `[REDACTED-TYPE]` (for example `[REDACTED-PHONE]`). It is idempotent.

**Names are flagged but not redacted** by default, because name detection is the least reliable heuristic and silently stripping a word that is not a name would damage the text. Pass `{ includeNames: true }` to redact them too.

**In the app:** `detectPHI` keeps flagging names, and the runner's live check highlights them and blocks Generate. The "Redact all" button calls `redactPHI(text, { includeNames: true })`, so one click removes everything the detector found, names included. Only a bare `redactPHI(text)` call (the default) leaves names in place.

## Known limits

- Names without a cue ("Kamal arrived late") are not detected. Cued names can be false positives.
- Street addresses need a number and a capitalised street word ("45 Galle Road"). Addresses without a number, or with a lowercase street word, are missed.
- A bare five-digit number is not treated as a postal code; a cue such as "postal code" is required.
- Dates are not range-checked; `99/99/2024` is flagged.
- Bare passport patterns (one or two capital letters plus 6-8 digits) can match unrelated codes.
- Only the formats above are covered. Other countries' identifiers, free-text descriptions of a person ("the man who lives above the bakery"), and clinical details are not detected.
- Health information that is not an identifier (diagnoses, medications, results) is never flagged. Combined with a few indirect details it can still identify someone.

## Other safeguards in this layer

- `buildSystemPrompt` (`lib/ai/systemPrompt.ts`) tells the model not to diagnose or prescribe, to use only the information provided, to point out contradictions, and never to confirm that anyone is a patient.
- `renderTemplate` (`lib/ai/render.ts`) refuses to produce a prompt when a required variable is missing, and never leaves a `{{placeholder}}` unfilled.
- Templates that need a clinician's judgment carry a "Must be approved by the clinic's medical director before use" banner. That banner is an instruction to the model; the review itself is a human step.

Treat model output as a draft. A person must read it before it is used or published.

## What is enforced where

| Safeguard | Where it runs | Notes |
| --------- | ------------- | ----- |
| PHI detection on every input and on refinement instructions | Browser (live highlight) and server (authoritative, `lib/safety/inputs.ts`) | The server check cannot be skipped by editing the page. A finding returns 422 and writes `PHI_BLOCKED`. |
| Administrator override | Server only | ADMIN role, a reason of 10+ characters, audited as `PHI_OVERRIDE`. Other roles get 403 and an audited block. |
| Non-clinical boundary | System prompt (`lib/ai/systemPrompt.ts`) | The model is told not to diagnose, prescribe or advise on treatment, to use only what it was given, and not to confirm that anyone is a patient. Prompts cannot guarantee behaviour; review is the real control. |
| Human review of patient-facing drafts | Browser gate plus server record | Copy and export are disabled until "I have reviewed this" is ticked; `/api/export/[id]` refuses an unreviewed patient-facing draft. The browser cannot be stopped from copying text it has already received, so the copy gate is a workflow control, not a security boundary (DECISIONS #32). |
| Rate limit | Server, atomic | One slot per generate or refine under a per-user database lock, so parallel requests cannot exceed `RATE_LIMIT_PER_HOUR`. |
| Request limits | Server | `/api/generate` bodies over 256 KB get 413; each field is capped; server actions are capped at 256 KB. |
| Transport and page hardening | Every response | CSP (same origin only, no framing, no plugins), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production. The CSP allows inline scripts because nonces would require dynamic rendering for every page. |
| Errors | Server | API errors use one JSON shape with a short code. Stack traces and internal messages are logged on the server, never returned. |

## Audit

Every generation, refinement, review, PHI block and override, export, login (success and failure),
user change, settings change and template edit writes an `AuditLog` row. Rows hold ids, counts,
types and short reasons. They never hold draft text, prompts, inputs, passwords, email addresses or
the personal details a detector matched; `lib/audit/sanitize.ts` removes such keys and redacts
strings as a last line of defence. A failed login stores a fingerprint of the email, not the
address. The repository has no update or delete path, and the viewer (`/admin/audit`, admins only)
can export the filtered log as CSV, which is itself logged.

The generations table does hold the inputs, prompt and output (that is what History shows). Treat
the database as sensitive, restrict who can read it, and apply your own retention policy.

## Responsibilities that stay with people

- Entering anonymized text only.
- Reading every draft before it is used, especially anything a patient will see.
- Having a clinician approve templates that carry the medical-director banner.
- Complying with the privacy law that applies to the clinic (HIPAA, PDPA, GDPR or other). This
  software does not make a clinic compliant.
- Securing the deployment: HTTPS, strong `AUTH_SECRET`, database access, backups and key handling.
- Sending text to a third-party model (when `LLM_PROVIDER=anthropic`) is a data-processing decision
  the clinic must make; the mock provider sends nothing anywhere.
