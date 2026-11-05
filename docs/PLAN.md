# ClinicAssist — Build Plan

Source of truth for scope: the original build prompt. This file tracks structure, data model and phase status.

## Folder structure (target)

```
app/
  (auth)/login
  (app)/dashboard | templates | templates/[slug] | history | analytics
  (app)/admin/templates | users | settings | audit
  api/generate/route.ts
components/            ui (shadcn), runner, template-card, phi-highlighter, markdown-viewer
lib/
  ai/      provider.ts anthropic.ts mock.ts systemPrompt.ts render.ts
  safety/  phi.ts
  auth/    config.ts guards.ts
  db/      prisma.ts
  export/  docx.ts pdf.ts md.ts
  audit.ts
prisma/    schema.prisma seed.ts seed-data/templates.ts
tests/     unit integration e2e
docs/      PLAN.md DECISIONS.md SAFETY.md ARCHITECTURE.md
docker-compose.yml  .env.example  README.md
```

## Data model

User, ClinicProfile (single row), Category, Template, TemplateVersion, Generation,
GenerationRefinement, Favorite (userId+templateId), AuditLog (append-only).
Auth.js adapter tables (Account, Session, VerificationToken) are added in Phase 2.
Indexes on all foreign keys and `createdAt`. Full field list: see `prisma/schema.prisma`.

## Phase checklist

- [ ] **Phase 1** Scaffold & infrastructure (Next.js, TS strict, Tailwind, shadcn/ui, ESLint/Prettier, Husky, docker-compose, Prisma schema + migration, .env.example, README)
- [x] **Phase 2** Auth & RBAC (code + unit tests done; login flow unverified against a DB, see DECISIONS #9)
- [x] **Phase 3** Templates & seed (24 templates, idempotent)
- [ ] **Phase 4** Safety layer (PHI detector, system prompt, renderer)
- [ ] **Phase 5** AI runner (providers, streaming, runner UI, rate limit)
- [ ] **Phase 6** History, export, admin template editor, versioning
- [ ] **Phase 7** Analytics & audit-log viewer
- [ ] **Phase 8** Hardening & delivery (E2E, a11y, security headers, docs)
