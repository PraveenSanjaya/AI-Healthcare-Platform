# ClinicAssist

AI-powered assistant platform for medical centers: a library of vetted prompt templates for patient
communication, local SEO, reviews and clinic operations, with PHI safeguards and an audit log.

> **Not a clinical decision tool.** It never diagnoses, prescribes or advises on treatment. Use
> anonymized text only. Every output is an AI draft that staff must review before use.

**Status:** Phase 1 (scaffold & infrastructure) of 8. See [docs/PLAN.md](docs/PLAN.md) and
[docs/DECISIONS.md](docs/DECISIONS.md).

## Setup (local, no Docker)

Requires Node.js 22+. The database is Prisma's local Postgres dev server.

```bash
git clone https://github.com/PraveenSanjaya/AI-Healthcare-Platform.git
cd AI-Healthcare-Platform
cp .env.example .env          # then set AUTH_SECRET, DATABASE_URL and SEED_ADMIN_PASSWORD (see below)
npm install
npx prisma dev -d -n clinicassist   # start the local Postgres in the background (once per boot)
npx prisma migrate dev        # apply migrations
npm run db:seed               # create the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev                   # http://localhost:3000
```

- `npx prisma dev ls` lists servers; `npx prisma dev stop clinicassist` stops it; start it again
  with `npx prisma dev start clinicassist`. Data persists between runs.
- `prisma dev` prints a direct TCP connection string (`postgres://...@localhost:<port>/...`).
  Create a database (e.g. `clinicassist`) and put that URL in `DATABASE_URL`. `.env` is git-ignored;
  never commit it.
- `SEED_ADMIN_PASSWORD` must be 12+ characters with upper-case, lower-case and a digit, otherwise
  the seed refuses to run. Re-running the seed never changes an existing admin's password.

### Alternative: Docker

`docker-compose.yml` is kept: `docker compose up -d` starts PostgreSQL 16 on `localhost:5432`
(use the `DATABASE_URL` from `.env.example`). Optional DB UI (Adminer on http://localhost:8080):
`docker compose --profile tools up -d`.

`npm run seed` for the template library is added in Phase 3.

## Scripts

| Script                                  | Purpose                                     |
| --------------------------------------- | ------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js dev server / production build / run |
| `npm run lint`                          | ESLint                                      |
| `npm run typecheck`                     | Generate route types, then `tsc --noEmit`   |
| `npm test`                              | Vitest unit/integration tests               |
| `npm run format` / `format:check`       | Prettier                                    |
| `npm run db:generate` / `db:migrate`    | Prisma client / migrations                  |
| `npm run db:seed`                       | Create/refresh the seed admin               |

A Husky pre-commit hook runs lint-staged (ESLint + Prettier on staged files).

## Stack

Next.js (App Router) + TypeScript strict, Tailwind CSS 4, shadcn/ui, Prisma 7 + PostgreSQL 16,
Vitest. Auth.js, the LLM providers, Playwright and exports arrive in later phases.

## Roles, safety design, adding templates

Documented as those features land (Phases 2–8).