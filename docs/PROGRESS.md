# Progress

Resume point for an interrupted session: say "continue from docs/PROGRESS.md".

**Current:** Phase 6 (`feature/phase-6-history-export`), started 2026-11-05.

## Done

| Phase | PR | Merged |
| ----- | -- | ------ |
| 1-4 (scaffold, auth, templates, safety layer) | #1-#8 | yes |
| 5 AI runner | #9 | yes |
| 5 Playwright tests | #10 | yes |

## Phase 6 open items

- [ ] History (`/history`, filters, detail, reopen)
- [ ] Export (.md, .docx, .pdf; server-side review gate; EXPORTED audit)
- [ ] Clinic settings (`/admin/settings`)
- [ ] Template editor (`/admin/templates`, versions, diff, archive)
- [ ] Unit and E2E tests

## Later

- Phase 7: analytics and audit log. Phase 8: hardening, CI, docs, v1.0.0 release.

## Run rules

- 13.1 check before the first commit and every push. If only the active `gh` account is wrong and PraveenSanjaya is logged in, run `gh auth switch -u PraveenSanjaya` and confirm (DECISIONS #38).
- Dev DB: `npx prisma dev start clinicassist`; on "Connection terminated unexpectedly" stop/start it. Run `npm run db:clean-e2e` after e2e runs.
