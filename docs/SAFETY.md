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
| `name`        | the name after `Mr.`/`Mrs.`/`Ms.`/`Dr.`, `patient`, `name:` (flag only)     |

Unfilled placeholders such as `[Phone Number]` and `{{phone}}` are ignored. Square brackets that contain digits are not treated as placeholders, so `[0771234567]` is still caught.

## Redaction

`redactPHI` replaces each finding with `[REDACTED-TYPE]` (for example `[REDACTED-PHONE]`). It is idempotent.

**Names are flagged but not redacted** by default, because name detection is the least reliable heuristic and silently stripping a word that is not a name would damage the text. Pass `{ includeNames: true }` to redact them too.

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
