# ClinicAssist

AI-powered assistant platform for medical centers: a library of vetted prompt templates for patient
communication, local SEO, reviews and clinic operations, with PHI safeguards and an audit log.

> **Not a clinical decision tool.** It never diagnoses, prescribes or advises on treatment. Use
> anonymized text only. Every output is an AI draft that staff must review before use.

**Status:** Phase 1 (scaffold & infrastructure) of 8. See [docs/PLAN.md](docs/PLAN.md) and
[docs/DECISIONS.md](docs/DECISIONS.md).

## Setup (Windows + WSL2 Ubuntu + Docker Desktop)

Run everything from a WSL bash shell, with the repo checked out inside the WSL filesystem
(e.g. `~/dev/AI-Healthcare-Platform`) for best performance. Docker Desktop must have WSL
integration enabled for your Ubuntu distro. Requires Node.js 22+.

```bash
git clone https://github.com/PraveenSanjaya/AI-Healthcare-Platform.git
cd AI-Healthcare-Platform
cp .env.example .env          # then edit AUTH_SECRET and the seed admin password
docker compose up -d          # PostgreSQL 16 on localhost:5432
npm install
npx prisma migrate dev        # creates the schema (first run also generates the initial migration)
npm run dev                   # http://localhost:3000
```

Optional DB UI (Adminer on http://localhost:8080): `docker compose --profile tools up -d`.

`npm run seed` is added in Phase 3 together with the template library.

> The initial migration has not been generated yet: Phase 1 was built on a machine without Docker.
> Your first `npx prisma migrate dev` creates `prisma/migrations/` — commit it.

## Scripts

| Script                                  | Purpose                                     |
| --------------------------------------- | ------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js dev server / production build / run |
| `npm run lint`                          | ESLint                                      |
| `npm run typecheck`                     | Generate route types, then `tsc --noEmit`   |
| `npm test`                              | Vitest unit/integration tests               |
| `npm run format` / `format:check`       | Prettier                                    |
| `npm run db:generate` / `db:migrate`    | Prisma client / migrations                  |

A Husky pre-commit hook runs lint-staged (ESLint + Prettier on staged files).

## Stack

Next.js (App Router) + TypeScript strict, Tailwind CSS 4, shadcn/ui, Prisma 7 + PostgreSQL 16,
Vitest. Auth.js, the LLM providers, Playwright and exports arrive in later phases.

## Roles, safety design, adding templates

Documented as those features land (Phases 2–8).