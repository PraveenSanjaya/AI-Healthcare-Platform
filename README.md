# ClinicAssist

A web app for medical centres: a library of 24 vetted AI prompt templates for patient communication,
local SEO, reviews and clinic operations. Staff fill in a form, the app checks the text for personal
information, asks an AI model for a draft, and a person reviews the draft before it is used. Every
important action is written to an audit log.

> **Not a clinical decision tool.** It never diagnoses, prescribes or advises on treatment. Use
> anonymized text only. Every output is an AI draft that staff must review before use.

## Features

- **Template library:** 24 templates in six categories (internal operations, patient education,
  Google and local SEO, social media and reputation, email and retention, practice operations). Browse, search, filter by
  category or audience, and mark favourites.
- **Runner:** a form per template, a view of the exact prompt, streaming output, word and character
  counters, regenerate and refine ("make it shorter").
- **PHI safeguards:** emails, phone numbers, Sri Lankan NIC numbers, dates of birth, addresses and
  more are highlighted and **block Generate** until removed. "Redact all" fixes them in one click.
  Only an administrator can override, and must give a reason.
- **Human in the loop:** patient-facing drafts cannot be copied or exported until the user ticks
  "I have reviewed this". Refining a draft clears the tick.
- **History and export:** past generations, export to Markdown, Word (.docx) and PDF.
- **Analytics** (managers and admins): generations per template, user and day, PHI blocks and
  overrides, review rate, output length, token use and an estimated cost.
- **Audit log** (admins): logins, failed logins, generations, PHI blocks and overrides, exports,
  user changes, settings and template edits. Filter, page and download as CSV. Append-only.
- **Admin:** user management, clinic settings, template editor with versioning.
- **Works without an AI key:** `LLM_PROVIDER=mock` (the default) returns a deterministic draft.

## Screenshots

_Placeholder: add screenshots here (template runner, PHI block, analytics, audit log)._

## Quick start (Windows, no Docker)

Requires Node.js 22+.

```powershell
git clone https://github.com/PraveenSanjaya/AI-Healthcare-Platform.git
cd AI-Healthcare-Platform
copy .env.example .env        # then edit .env (see "Environment variables")
npm install
npx prisma dev -d -n clinicassist     # starts a local Postgres in the background
```

`prisma dev` prints a **direct TCP** connection string (`postgres://postgres:postgres@localhost:<port>/template1?...`).
Put it in `DATABASE_URL` in `.env` (use a database name of your choice, for example `clinicassist`).
Then:

```powershell
npx prisma migrate deploy     # apply the migrations
npm run db:seed               # creates the admin user and the 24 templates (safe to re-run)
npm run dev                   # http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env`.

Useful: `npx prisma dev ls` lists servers, `npx prisma dev stop clinicassist` stops one and
`npx prisma dev start clinicassist` starts it again. Data persists.

If the local database answers simple queries but drops the connection on joins (seen with
`prisma dev`), stop and start it, or run `npm run db:probe` (exit code 0 means healthy).

## Quick start (Docker)

```bash
cp .env.example .env          # edit AUTH_SECRET and SEED_ADMIN_PASSWORD
docker compose up -d          # PostgreSQL 16 on localhost:5432
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

`docker compose --profile tools up -d` also starts Adminer on http://localhost:8080.

## Environment variables

| Variable              | Required | Purpose                                                                                       |
| --------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | PostgreSQL connection string.                                                                 |
| `AUTH_SECRET`         | yes      | Random string used to sign sessions. Generate one with `npx auth secret` or `openssl rand -base64 32`. |
| `SEED_ADMIN_EMAIL`    | yes      | Email of the first administrator created by the seed.                                         |
| `SEED_ADMIN_PASSWORD` | yes      | 12+ characters with upper case, lower case and a digit. The seed refuses weaker passwords.     |
| `LLM_PROVIDER`        | no       | `mock` (default) or `anthropic`. `anthropic` without a key falls back to the mock.            |
| `ANTHROPIC_API_KEY`   | no       | Needed only for `LLM_PROVIDER=anthropic`.                                                     |
| `LLM_MODEL`           | no       | Model id; a sensible default is used when empty.                                              |
| `RATE_LIMIT_PER_HOUR` | no       | Generations plus refinements per user per hour. Default 30.                                   |
| `DB_POOL_MAX`         | no       | Cap on database connections (useful for the local `prisma dev` server; leave unset elsewhere). |

`.env` is git-ignored. Never commit it.

## Roles

| Role        | Can do                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| **STAFF**   | Browse and run templates, see their own history, export their own drafts.                           |
| **MANAGER** | Everything STAFF can, plus everyone's history, **Analytics**, and the clinic details in **Settings**. |
| **ADMIN**   | Everything, plus users, all settings, the template editor, the **audit log**, and the PHI override.  |

Access is enforced on the server (`proxy.ts`, `lib/auth/route-access.ts`, and the service layer),
not only by hiding links.

## Scripts

| Script                                       | Purpose                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`            | Development server / production build / run the build               |
| `npm run lint` / `typecheck` / `format:check`| ESLint / TypeScript / Prettier check                                 |
| `npm test`                                   | Unit tests (Vitest)                                                  |
| `npm run test:coverage`                      | Unit tests with coverage; fails under 80% for `lib/safety`, `lib/ai` |
| `npm run test:e2e`                           | Browser tests (Playwright, Chromium and Firefox)                     |
| `npm run db:migrate` / `db:seed`             | Create a migration (dev) / seed admin and templates                  |
| `npm run db:clean-e2e`                       | Remove the data the browser tests create (local databases only)      |
| `npm run db:probe`                           | Check the local database answers join queries                        |

A Husky pre-commit hook runs ESLint and Prettier on staged files. GitHub Actions
(`.github/workflows/ci.yml`) runs everything above on each push and pull request.

## Adding a template

**In the app (admin):** go to **Manage templates** → **New template**. Write the prompt with
`{{variable}}` placeholders, define each variable (name, label, type, required, options, default),
choose the audience (internal or patient-facing), the allowed roles and an optional word or character
limit. Every `{{placeholder}}` must have a variable and vice versa. Saving a change to an existing
template creates a new version; earlier generations keep the version they used.

**In code (shipped with the app):** add an entry to `prisma/seed-data/templates.ts` and run
`npm run db:seed`. The seed is idempotent: it creates new templates and adds a version only when the
text changed.

## Safety design (short version)

1. The PHI detector runs in the browser (live highlighting) **and** on the server (authoritative).
2. A finding blocks the request before any model call. Only an admin can override, with a written
   reason, and the override is audited.
3. The system prompt forbids diagnosis, prescribing and treatment advice and tells the model to use
   only what it was given.
4. Patient-facing output is gated behind a manual review before copy or export.
5. Audit rows hold ids, counts and types, never draft text or the matched personal details.
6. Security headers, request size limits and an atomic per-user rate limit protect the endpoint.

The detector is a heuristic safeguard, not a guarantee. Read [docs/SAFETY.md](docs/SAFETY.md) for
what it catches, what it misses, and where responsibility stays with people.

## Testing

- **Unit tests:** Vitest, 400+ tests, including the PHI detector, prompt renderer, providers,
  rate limit (with a database concurrency test), RBAC, history, exports, analytics and audit.
- **Browser tests:** Playwright on Chromium and Firefox against `next dev` with the mock provider
  on port 3200. They cover the main flow, PHI blocking and redaction, review gating, role access,
  the admin pages, analytics, the audit log, security headers and accessibility (axe-core, light and
  dark, zero serious or critical violations). Run `npm run db:clean-e2e` afterwards to remove test
  accounts.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): diagrams of the system, request flow and data model
- [docs/SAFETY.md](docs/SAFETY.md): safety design and limits
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md): short guide for staff, managers and admins
- [docs/DECISIONS.md](docs/DECISIONS.md): choices made along the way
- [docs/PLAN.md](docs/PLAN.md), [docs/PROGRESS.md](docs/PROGRESS.md), [CHANGELOG.md](CHANGELOG.md)

## Stack

Next.js 16 (App Router, partial prerendering), TypeScript (strict), Tailwind CSS 4, shadcn/ui,
Auth.js v5, Prisma 7 with PostgreSQL 16, Recharts, the Anthropic SDK, Vitest and Playwright.
